import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// ─────────────────────────────────────────────
// 1. AUTH PAGE: Login & Registration
// ─────────────────────────────────────────────
function AuthPage() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleAuth = async (e) => {
    e.preventDefault();
    const endpoint = isRegistering ? 'register' : 'login';
    const body = isRegistering ? { username, email, password } : { identifier, password };

    try {
      const resp = await fetch(`http://127.0.0.1:5000/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (resp.ok) {
        if (!isRegistering) {
          localStorage.setItem('token', data.token); // Store JWT
          navigate('/dashboard');
        } else {
          setMessage("Account created! Please log in.");
          setIsRegistering(false);
        }
      } else { setMessage(data.error || "Auth failed"); }
    } catch (err) { setMessage("Connection error."); }
  };

  return (
    <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h1>Ano Tara App 🇵🇭</h1>
      <form onSubmit={handleAuth} style={{ display: 'inline-block', textAlign: 'left', width: '300px' }}>
        {isRegistering && <input type="text" placeholder="Username" style={{width:'100%', marginBottom:'10px'}} onChange={e=>setUsername(e.target.value)} required />}
        <input type="text" placeholder={isRegistering ? "Email" : "Username or Email"} style={{width:'100%', marginBottom:'10px'}} onChange={e => isRegistering ? setEmail(e.target.value) : setIdentifier(e.target.value)} required />
        <input type="password" placeholder="Password" style={{width:'100%', marginBottom:'10px'}} onChange={e=>setPassword(e.target.value)} required />
        <button type="submit" style={{width:'100%', padding:'10px', backgroundColor:'black', color:'white', border:'none', cursor:'pointer'}}>
          {isRegistering ? 'Register' : 'Login'}
        </button>
      </form>
      <p onClick={() => setIsRegistering(!isRegistering)} style={{ color: 'blue', cursor: 'pointer', marginTop: '15px' }}>
        {isRegistering ? "Already have an account? Login" : "Don't have an account? Register"}
      </p>
      {message && <p>{message}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────
// 2. TRAVEL WIZARD: The Core Service Interface
// ─────────────────────────────────────────────
function TravelWizard() {
  // Corrected States
  const [step, setStep] = useState(1);
  const [destination, setDestination] = useState('');
  const [numDays, setNumDays] = useState(3);
  const [preferences, setPreferences] = useState([]);
  const [budget, setBudget] = useState('comfort');
  const [finalItinerary, setFinalItinerary] = useState(null);
  const [destCoords, setDestCoords] = useState(null);

  const mapContainer = useRef(null);
  const map = useRef(null);

  // API Call to Python Backend
  const handleCraftItinerary = async () => {
    setStep(5); // Show Loading Screen
    try {
      const response = await fetch('http://127.0.0.1:5000/api/itinerary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}` // JWT Security
        },
        body: JSON.stringify({ destination, num_days: numDays, preferences, budget })
      });
      const data = await response.json();
      if (response.ok) {
        setFinalItinerary(data.itinerary);
        setDestCoords(data.dest_coords);
        setStep(6); // Show Dashboard/Map
      } else { alert(data.error); setStep(4); }
    } catch (err) { alert("API Connection Error"); setStep(4); }
  };

  // Mapbox Integration
  useEffect(() => {
    if (step !== 6 || !finalItinerary || !destCoords || map.current) return;

    const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!mapboxToken) {
      console.error('VITE_MAPBOX_TOKEN is not set. Map rendering is disabled.');
      return;
    }

    mapboxgl.accessToken = mapboxToken;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v10',
      center: [destCoords.lon, destCoords.lat],
      zoom: 10
    });

    map.current.on('load', () => {
      // Draw Travel Route
      const routeCoords = Object.values(finalItinerary).flat().map(p => [p.longitude, p.latitude]);
      
      map.current.addSource('route', {
        'type': 'geojson',
        'data': { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': routeCoords } }
      });

      map.current.addLayer({
        'id': 'route', 'type': 'line', 'source': 'route',
        'paint': { 'line-color': '#3b82f6', 'line-width': 4 }
      });

      // Markers
      new mapboxgl.Marker({ color: 'blue' }).setLngLat(routeCoords[0]).addTo(map.current);
      new mapboxgl.Marker({ color: 'red' }).setLngLat(routeCoords[routeCoords.length - 1]).addTo(map.current);
    });
  }, [step, finalItinerary, destCoords]);

  return (
    <div style={{ backgroundColor: '#e0f7f4', height: '100vh', width: '100vw', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif' }}>
      
      {/* STEP 1: DESTINATION */}
      {step === 1 && (
        <div style={{textAlign:'center'}}>
          <p>STEP 1 OF 4 • WHERE TO?</p>
          <h1>Where in the Philippines<br/>are you headed?</h1>
          <input value={destination} onChange={e=>setDestination(e.target.value)} style={{fontSize:'24px', padding:'10px', border:'none', borderBottom:'2px solid black', backgroundColor:'transparent', textAlign:'center'}} placeholder="Laguna..." />
          <br/><button onClick={()=>setStep(2)} style={{marginTop:'20px', padding:'10px 30px', backgroundColor:'black', color:'white', borderRadius:'20px', cursor:'pointer'}}>Continue →</button>
        </div>
      )}

      {/* STEP 2: DURATION */}
      {step === 2 && (
        <div style={{textAlign:'center'}}>
          <p>STEP 2 OF 4</p>
          <h1>How many days?</h1>
          <div style={{display:'flex', gap:'15px', justifyContent:'center'}}>
            {[2, 3, 5, 7].map(d => (
              <div key={d} onClick={()=>setNumDays(d)} style={{padding:'20px', borderRadius:'10px', backgroundColor: numDays === d ? 'black' : 'white', color: numDays === d ? 'white' : 'black', cursor:'pointer', border:'1px solid #ddd'}}>
                {d} Days
              </div>
            ))}
          </div>
          <button onClick={()=>setStep(3)} style={{marginTop:'20px', padding:'10px 30px', backgroundColor:'black', color:'white', borderRadius:'20px'}}>Continue</button>
        </div>
      )}

      {/* STEP 3: PREFERENCES & BUDGET */}
      {step === 3 && (
        <div style={{textAlign:'center'}}>
          <h1>Curate your experience</h1>
          <div style={{marginBottom:'20px'}}>
            {['food', 'beach', 'nature', 'museums', 'nightlife'].map(p => (
              <button key={p} onClick={() => preferences.includes(p) ? setPreferences(preferences.filter(x=>x!==p)) : setPreferences([...preferences, p])}
                style={{margin:'5px', padding:'10px', backgroundColor: preferences.includes(p) ? 'black' : 'white', color: preferences.includes(p) ? 'white' : 'black', borderRadius:'10px'}}>
                {p}
              </button>
            ))}
          </div>
          <div style={{display:'flex', gap:'10px', justifyContent:'center'}}>
            {['Backpacker', 'Comfort', 'Luxury'].map(s => (
              <button key={s} onClick={()=>setBudget(s.toLowerCase())} style={{padding:'10px', backgroundColor: budget === s.toLowerCase() ? 'black' : 'white', color: budget === s.toLowerCase() ? 'white' : 'black'}}>
                {s}
              </button>
            ))}
          </div>
          <button onClick={()=>setStep(4)} style={{marginTop:'20px', padding:'10px 30px', backgroundColor:'black', color:'white', borderRadius:'20px'}}>Review</button>
        </div>
      )}

      {/* STEP 4: SUMMARY */}
      {step === 4 && (
        <div style={{textAlign:'center'}}>
          <h1>Ready to explore?</h1>
          <div style={{backgroundColor:'white', padding:'20px', borderRadius:'15px', textAlign:'left', margin:'20px 0'}}>
            <p><b>Destination:</b> {destination}</p>
            <p><b>Duration:</b> {numDays} Days</p>
            <p><b>Style:</b> {budget}</p>
          </div>
          <button onClick={handleCraftItinerary} style={{padding:'15px 40px', backgroundColor:'black', color:'white', borderRadius:'30px', fontWeight:'bold'}}>Craft My Itinerary →</button>
        </div>
      )}

      {/* STEP 5: LOADING */}
      {step === 5 && (
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:'50px', animation:'pulse 1.5s infinite'}}>📍</div>
          <h1>Crafting your journey...</h1>
          <p>Calculating optimal travel routes across {destination}...</p>
        </div>
      )}

      {/* STEP 6: DASHBOARD & MAP */}
      {step === 6 && finalItinerary && (
        <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
          <div style={{ width: '40%', padding: '20px', overflowY: 'auto', backgroundColor: '#f9f9f9' }}>
            <h2>Your Itinerary</h2>
            {Object.entries(finalItinerary).map(([day, places]) => (
              <div key={day}>
                <h3>Day {day}</h3>
                {places.map((p, i) => (
                  <div key={i} style={{padding:'10px', backgroundColor:'white', marginBottom:'10px', borderRadius:'8px', border:'1px solid #eee'}}>
                    <b>{i+1}. {p.name}</b><br/><small>{p.category} • ⭐ {p.rating}</small>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div ref={mapContainer} style={{ width: '60%', height: '100%' }} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 3. MAIN ROUTING
// ─────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/dashboard" element={<TravelWizard />} />
      </Routes>
    </BrowserRouter>
  );
}