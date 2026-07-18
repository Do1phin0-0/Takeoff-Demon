function polygonAreaPixels(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const { x: x1, y: y1 } = points[i];
    const { x: x2, y: y2 } = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function computeSquareFootage(polygon, scale) {
  const feetPerUnit = scale.unit === "in" ? 1 / 12 : 1;
  const realDistanceFeet = scale.realDistance * feetPerUnit;
  const feetPerPixel = realDistanceFeet / scale.pixelDistance;
  const areaPixels = polygonAreaPixels(polygon);
  const areaSqFt = areaPixels * feetPerPixel * feetPerPixel;
  return { areaSqFt, feetPerPixel, areaPixels };
}

module.exports = { polygonAreaPixels, computeSquareFootage };
