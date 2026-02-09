import { useNavigate } from "react-router-dom";
import sgHealthtrackLogo from "../image/sghealthtrack-logo.png";
import clinicHero from "../image/clinic-template.jpeg";

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      <header className="landing-topbar">
        <div className="landing-shell landing-topbar-inner">
          <div className="landing-logo-wrap">
            <img src={sgHealthtrackLogo} alt="SG HealthTrack" className="landing-logo" />
            <span className="landing-brand-name">SG HealthTrack</span>
          </div>
          <nav className="landing-nav">
            <a href="#home">Home</a>
            <a href="#services">Services</a>
            <a href="#about">About</a>
            <a href="#contact">Contact</a>
          </nav>
          <button className="landing-portal-btn" type="button" onClick={() => navigate("/login")}>
            Patient Portal
          </button>
        </div>
      </header>

      <main>
        <section className="landing-hero" id="home">
          <div className="landing-shell landing-hero-grid">
            <div className="landing-hero-copy">
              <span className="landing-pill">Now offering rapid PCR tests</span>
              <h1>
                Fast. Accurate.
                <br />
                <span>Caring Diagnostics.</span>
              </h1>
              <p>
                Experience healthcare that respects your time and health. Advanced imaging, comprehensive labs,
                and expert consultations—all in one modern facility.
              </p>
              <div className="landing-hero-actions">
                <button className="landing-primary-btn" type="button" onClick={() => navigate("/signup")}>
                  Book Appointment
                </button>
                <button className="landing-outline-btn" type="button" onClick={() => navigate("/login")}>
                  View Packages
                </button>
              </div>
              <div className="landing-stats">
                <div>
                  <strong>15k+</strong>
                  <span>Patients Served</span>
                </div>
                <div>
                  <strong>98%</strong>
                  <span>Accuracy Rate</span>
                </div>
                <div>
                  <strong>24h</strong>
                  <span>Result Turnaround</span>
                </div>
              </div>
            </div>
            <div className="landing-hero-media">
              <img src={clinicHero} alt="Clinic reception" />
              <div className="landing-hero-badge">
                <div className="badge-icon">✓</div>
                <div>
                  <strong>Verified Results</strong>
                  <span>ISO 9001 Certified Lab</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-services" id="services">
          <div className="landing-shell landing-section-head">
            <h2>Comprehensive Services</h2>
            <p>We use state-of-the-art technology to provide you with the most accurate diagnostic results.</p>
          </div>
          <div className="landing-shell landing-service-grid">
            <article className="landing-service-card">
              <img src={clinicHero} alt="Laboratory services" />
              <div className="landing-service-body">
                <div className="landing-service-icon">🧪</div>
                <h3>Advanced Laboratory</h3>
                <p>Complete blood work, biochemistry, and specialized pathology tests with rapid turnaround.</p>
                <button className="landing-link-btn" type="button">Learn more →</button>
              </div>
            </article>
            <article className="landing-service-card">
              <img src={clinicHero} alt="Imaging services" />
              <div className="landing-service-body">
                <div className="landing-service-icon">🩻</div>
                <h3>Digital Imaging</h3>
                <p>Low-dose digital X-rays, ultrasound, and ECG services performed by certified technicians.</p>
                <button className="landing-link-btn" type="button">Learn more →</button>
              </div>
            </article>
            <article className="landing-service-card">
              <img src={clinicHero} alt="Consultation services" />
              <div className="landing-service-body">
                <div className="landing-service-icon">🩺</div>
                <h3>Expert Consultation</h3>
                <p>Discuss your results immediately with our resident general physicians and specialists.</p>
                <button className="landing-link-btn" type="button">Learn more →</button>
              </div>
            </article>
          </div>
        </section>

        <section className="landing-steps" id="about">
          <div className="landing-shell landing-section-head">
            <h2>How It Works</h2>
            <p>Simple, streamlined process designed for your comfort.</p>
          </div>
          <div className="landing-shell landing-steps-grid">
            <div className="landing-step">
              <div className="landing-step-icon">🕒</div>
              <h4>1. Book Appointment</h4>
              <p>Schedule online or walk in. We prioritize your time.</p>
            </div>
            <div className="landing-step">
              <div className="landing-step-icon">🧬</div>
              <h4>2. Visit &amp; Test</h4>
              <p>Quick, hygienic sample collection and imaging.</p>
            </div>
            <div className="landing-step">
              <div className="landing-step-icon">🛡️</div>
              <h4>3. Get Results</h4>
              <p>Access reports online securely or pick them up.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer" id="contact">
        <div className="landing-shell landing-footer-grid">
          <div>
            <div className="landing-footer-brand">
              <img src={sgHealthtrackLogo} alt="SG HealthTrack" />
              <span>SG HealthTrack</span>
            </div>
            <p>
              Leading diagnostic center committed to providing accurate and timely results with care.
            </p>
          </div>
          <div>
            <h5>Services</h5>
            <ul>
              <li>Laboratory Tests</li>
              <li>Radiology &amp; Imaging</li>
              <li>Health Packages</li>
              <li>Home Collection</li>
            </ul>
          </div>
          <div>
            <h5>Contact</h5>
            <ul>
              <li>(+63) 917-864-6762</li>
              <li>Calamba City, Laguna</li>
              <li>smartguys.com</li>
            </ul>
          </div>
          <div>
            <h5>Hours</h5>
            <ul>
              <li>Mon - Fri: 7:00 AM - 8:00 PM</li>
              <li>Saturday: 8:00 AM - 5:00 PM</li>
              <li>Sunday: Closed</li>
            </ul>
          </div>
        </div>
        <div className="landing-shell landing-footer-bottom">© 2024 SG HealthTrack Diagnostics. All rights reserved.</div>
      </footer>
    </div>
  );
}
