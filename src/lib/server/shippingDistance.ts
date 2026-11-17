// Fallback Haversine function
function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c; // Distance in km
}

export async function getDrivingDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  // Use a dedicated server key if available (recommended for backend Google APIs), 
  // otherwise fallback to the public key.
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return calculateHaversineDistance(lat1, lon1, lat2, lon2);

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat1},${lon1}&destinations=${lat2},${lon2}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
      // Distance is in meters, convert to km
      return data.rows[0].elements[0].distance.value / 1000;
    }
    console.warn("Google Distance Matrix API returned non-OK status, falling back to Haversine");
  } catch (error) {
    console.warn("Distance lookup unavailable");
  }
  
  // Fallback if API fails
  return calculateHaversineDistance(lat1, lon1, lat2, lon2);
}

