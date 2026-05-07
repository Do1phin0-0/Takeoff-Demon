"""
Subcontractor CRM API — reference server for the Copilot agents.

Implements the contract in appPackage/plugins/crm-openapi.yaml. Backed by a
SQLite database seeded from seed.csv on first run. API key is required on
every request via the X-Api-Key header.
"""
import csv
import os
import sqlite3
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field

DB_PATH = Path(os.environ.get("CRM_DB_PATH", "subcontractors.sqlite"))
SEED_PATH = Path(__file__).parent / "seed.csv"
API_KEY = os.environ.get("CRM_API_KEY", "dev-key-change-me")

BID_STATUSES = [
    "Not Contacted", "Bid Requested", "Bid Sent",
    "Bid Received", "Awarded", "Declined",
]


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS subcontractors (
                id TEXT PRIMARY KEY,
                company TEXT NOT NULL,
                contact_name TEXT,
                phone TEXT,
                email TEXT,
                website TEXT,
                trade TEXT NOT NULL,
                specialty TEXT,
                license_number TEXT,
                license_state TEXT,
                service_area_city TEXT,
                service_area_state TEXT,
                service_radius_miles INTEGER,
                project_types TEXT,
                bid_status TEXT NOT NULL DEFAULT 'Not Contacted',
                bid_amount REAL,
                notes TEXT,
                last_used_date TEXT
            )
        """)
        count = conn.execute("SELECT COUNT(*) FROM subcontractors").fetchone()[0]
        if count == 0 and SEED_PATH.exists():
            with SEED_PATH.open() as f:
                rows = list(csv.DictReader(f))
            for r in rows:
                conn.execute(
                    """INSERT INTO subcontractors VALUES
                       (:id,:company,:contact_name,:phone,:email,:website,:trade,
                        :specialty,:license_number,:license_state,:service_area_city,
                        :service_area_state,:service_radius_miles,:project_types,
                        :bid_status,:bid_amount,:notes,:last_used_date)""",
                    {**r,
                     "service_radius_miles": int(r["service_radius_miles"]) if r["service_radius_miles"] else None,
                     "bid_amount": float(r["bid_amount"]) if r["bid_amount"] else None},
                )


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Subcontractor CRM API",
    version="1.0.0",
    lifespan=lifespan,
)


def require_api_key(x_api_key: str = Header(default="")):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


class Subcontractor(BaseModel):
    id: str
    company: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    trade: str
    specialty: Optional[str] = None
    license_number: Optional[str] = None
    license_state: Optional[str] = None
    service_area_city: Optional[str] = None
    service_area_state: Optional[str] = None
    service_radius_miles: Optional[int] = None
    project_types: list[str] = Field(default_factory=list)
    bid_status: str = "Not Contacted"
    bid_amount: Optional[float] = None
    notes: Optional[str] = None
    last_used_date: Optional[date] = None


class BidStatusUpdate(BaseModel):
    bid_status: str
    bid_amount: Optional[float] = None
    notes: Optional[str] = None


def row_to_model(row: sqlite3.Row) -> Subcontractor:
    data = dict(row)
    data["project_types"] = data["project_types"].split(";") if data.get("project_types") else []
    return Subcontractor(**data)


@app.get("/subcontractors", dependencies=[Depends(require_api_key)])
def search_subcontractors(
    trade: str = Query(...),
    city: Optional[str] = None,
    state: Optional[str] = Query(None, min_length=2, max_length=2),
    radius_miles: int = Query(50, ge=0, le=500),
    project_type: Optional[str] = None,
    limit: int = Query(25, ge=1, le=100),
):
    sql = "SELECT * FROM subcontractors WHERE LOWER(trade) = LOWER(?)"
    args: list = [trade]
    if state:
        sql += " AND UPPER(service_area_state) = UPPER(?)"
        args.append(state)
    if city:
        sql += " AND (LOWER(service_area_city) = LOWER(?) OR service_radius_miles >= ?)"
        args.extend([city, radius_miles])
    if project_type:
        sql += " AND project_types LIKE ?"
        args.append(f"%{project_type}%")
    sql += " LIMIT ?"
    args.append(limit)

    with db() as conn:
        rows = conn.execute(sql, args).fetchall()
    results = [row_to_model(r) for r in rows]
    return {"count": len(results), "results": results}


@app.get("/subcontractors/{sub_id}", dependencies=[Depends(require_api_key)])
def get_subcontractor(sub_id: str):
    with db() as conn:
        row = conn.execute("SELECT * FROM subcontractors WHERE id = ?", [sub_id]).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return row_to_model(row)


@app.post("/subcontractors/{sub_id}/bid-status", dependencies=[Depends(require_api_key)])
def update_bid_status(sub_id: str, payload: BidStatusUpdate):
    if payload.bid_status not in BID_STATUSES:
        raise HTTPException(status_code=422, detail=f"bid_status must be one of {BID_STATUSES}")
    with db() as conn:
        existing = conn.execute("SELECT * FROM subcontractors WHERE id = ?", [sub_id]).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        new_notes = existing["notes"] or ""
        if payload.notes:
            stamp = date.today().isoformat()
            new_notes = (new_notes + f"\n[{stamp}] {payload.notes}").strip()
        conn.execute(
            """UPDATE subcontractors
               SET bid_status = ?,
                   bid_amount = COALESCE(?, bid_amount),
                   notes = ?
               WHERE id = ?""",
            [payload.bid_status, payload.bid_amount, new_notes, sub_id],
        )
        row = conn.execute("SELECT * FROM subcontractors WHERE id = ?", [sub_id]).fetchone()
    return row_to_model(row)
