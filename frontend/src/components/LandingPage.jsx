import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import BrandLogo from "./common/BrandLogo";
import Icon from "./common/Icon";
import {
  applyTheme,
  getInitialTheme,
  persistTheme,
  THEMES,
} from "../lib/theme";

const steps = [
  {
    number: "01",
    title: "Tell Us Your Vibe",
    text: "Pick your destination, budget, dates, companions, pacing, and travel mood.",
  },
  {
    number: "02",
    title: "AI Crafts the Route",
    text: "Ano-Tara! ranks places, balances travel time, and builds a practical day-by-day path.",
  },
  {
    number: "03",
    title: "Explore & Share",
    text: "Take your itinerary offline, invite your flock, and keep the map in sync.",
  },
];

const features = [
  {
    title: "Offline Ready",
    label: "PWA",
    text: "Install Ano-Tara! and keep essentials available when the island signal gets spotty.",
    className: "landing-bento-card--wide",
  },
  {
    title: "Smart Reranking",
    label: "ML",
    text: "The recommendation engine learns from feedback and surfaces stops that match your travel style.",
  },
  {
    title: "Collaborative Planning",
    label: "Flock",
    text: "Vote with friends, invite companions, and shape one shared trip plan before takeoff.",
  },
  {
    title: "Real-time Maps",
    label: "Mapbox",
    text: "Map-first itinerary views keep stops, routes, and day plans connected in one workspace.",
    className: "landing-bento-card--tall",
  },
];

const trendingTrips = [
  {
    destination: "Palawan Reset",
    detail: "El Nido lagoons, Coron viewpoints, slow island days",
    meta: "5 days · Beach · Comfort",
  },
  {
    destination: "Cebu Food & Falls",
    detail: "Lechon crawl, canyoneering, heritage walks",
    meta: "4 days · Food · Friends",
  },
  {
    destination: "Bohol Nature Loop",
    detail: "Chocolate Hills, river cruises, tarsier sanctuaries",
    meta: "3 days · Nature · Family",
  },
  {
    destination: "Baguio Cooldown",
    detail: "Art cafes, pine trails, local markets",
    meta: "2 days · Culture · Couple",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installMessage, setInstallMessage] = useState("");
  const [theme, setTheme] = useState(() => getInitialTheme());

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setInstallMessage("");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  const handlePlanTrip = () => {
    navigate("/generate");
  };

  const toggleTheme = () => {
    setTheme((currentTheme) =>
      currentTheme === THEMES.dark ? THEMES.light : THEMES.dark,
    );
  };

  const handleInstall = async () => {
    if (!installPrompt) {
      setInstallMessage("Use your browser menu to install Ano-Tara!");
      return;
    }

    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <main className="landing-page">
      <header className="landing-nav glass-card" aria-label="Ano-Tara! landing navigation">
        <Link className="landing-nav__brand" to="/landing" aria-label="Ano-Tara! landing page">
          <BrandLogo size={60} />
        </Link>
        <nav className="landing-nav__links" aria-label="Landing page sections">
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
          <a href="#trending">Trending</a>
        </nav>
        <div className="landing-nav__actions">
          <button
            className="landing-theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === THEMES.dark ? "light" : "dark"} mode`}
          >
            <Icon name={theme === THEMES.dark ? "sun" : "moon"} size={18} />
          </button>
          <Link className="landing-nav__login" to="/login">
            Log In
          </Link>
          <button className="landing-nav__cta" type="button" onClick={handlePlanTrip}>
            Plan Now
          </button>
        </div>
      </header>

      <section className="landing-hero" aria-labelledby="landing-hero-title">
        <div className="landing-hero__visual" aria-hidden="true">
          <span className="landing-hero__sun" />
          <span className="landing-hero__island landing-hero__island--one" />
          <span className="landing-hero__island landing-hero__island--two" />
          <span className="landing-hero__wave landing-hero__wave--one" />
          <span className="landing-hero__wave landing-hero__wave--two" />
        </div>
        <div className="landing-hero__content">
          <p className="landing-kicker">ML-powered Philippine journeys</p>
          <h1 id="landing-hero-title">
            Ano-Tara! turns Philippine travel dreams into polished itineraries.
          </h1>
          <p className="landing-hero__subhead">
            Plan island-hopping escapes, food trails, and city breaks with a
            flagship SaaS workspace wrapped in soft glass and fluid pastel motion.
          </p>
          <div className="landing-hero__actions">
            <Link className="landing-login-cta" to="/login">
              Log In
            </Link>
            <button className="landing-primary-cta" type="button" onClick={handlePlanTrip}>
              Plan My Trip Now
            </button>
            <a className="landing-secondary-link" href="#features">
              See what it can do
            </a>
          </div>
        </div>
        <aside className="landing-trip-card glass-card" aria-label="Sample generated itinerary">
          <p className="landing-trip-card__eyebrow">Generated Route</p>
          <h2>Siargao Surf + Food Trail</h2>
          <div className="landing-route-line">
            <span>Cloud 9</span>
            <span>Maasin River</span>
            <span>General Luna</span>
          </div>
          <div className="landing-trip-card__stats">
            <span>4 days</span>
            <span>Comfort</span>
            <span>Beach + Food</span>
          </div>
        </aside>
      </section>

      <section className="landing-section" id="how-it-works" aria-labelledby="how-title">
        <div className="landing-section__header">
          <p className="landing-kicker">How it works</p>
          <h2 id="how-title">From travel vibe to ready route in three clean steps.</h2>
        </div>
        <div className="landing-steps">
          {steps.map((step, index) => (
            <article
              className="landing-step glass-card landing-fade-up"
              style={{ "--landing-delay": `${index * 120}ms` }}
              key={step.title}
            >
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section" id="features" aria-labelledby="features-title">
        <div className="landing-section__header">
          <p className="landing-kicker">Core features</p>
          <h2 id="features-title">Built for real Philippine travel days.</h2>
        </div>
        <div className="landing-bento-grid">
          {features.map((feature) => (
            <article
              className={`landing-bento-card glass-card ${feature.className || ""}`}
              key={feature.title}
            >
              <span>{feature.label}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section" id="trending" aria-labelledby="trending-title">
        <div className="landing-section__header landing-section__header--split">
          <div>
            <p className="landing-kicker">Social proof</p>
            <h2 id="trending-title">Trending trips travelers are planning now.</h2>
          </div>
          <p>
            Swipe through destination ideas shaped around beaches, food trails,
            heritage, nature, and companion style.
          </p>
        </div>
        <div className="landing-carousel" aria-label="Trending trips carousel">
          {trendingTrips.map((trip) => (
            <article
              className="landing-trip-tile glass-card"
              key={trip.destination}
            >
              <div className="landing-trip-tile__image" aria-hidden="true" />
              <p>{trip.meta}</p>
              <h3>{trip.destination}</h3>
              <span>{trip.detail}</span>
            </article>
          ))}
        </div>
      </section>

      <footer className="landing-footer glass-card">
        <div>
          <BrandLogo size={48} />
          <p>
            Ano-Tara! keeps your next Philippine journey smart, collaborative, and
            ready even before you leave home.
          </p>
          {installMessage ? <p className="landing-install-message">{installMessage}</p> : null}
        </div>
        <button className="landing-install-button" type="button" onClick={handleInstall}>
          Install App
        </button>
      </footer>
    </main>
  );
}
