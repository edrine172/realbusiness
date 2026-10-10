import { ArrowDown, ArrowRight, Boxes, ChartNoAxesCombined, Package, ShieldCheck, Users } from 'lucide-react';

export default function LandingPage({ onOpenDashboard }: { onOpenDashboard: () => void }) {
  return <main className="landing-page" id="top">
    <header className="landing-header">
      <a className="landing-brand" href="#top" aria-label="StockPulse home">
        <span className="landing-brand-mark"><Package size={18}/></span>
        <span><strong>StockPulse</strong><small>OPERATIONS PLATFORM</small></span>
      </a>
      <nav className="landing-navigation" aria-label="Landing page navigation">
        <a href="#platform">Platform</a>
        <a href="#workflows">Workflows</a>
      </nav>
      <button className="landing-header-action" onClick={onOpenDashboard}>Sign in / sign up <ArrowRight size={15}/></button>
    </header>

    <section className="landing-hero" aria-labelledby="landing-title">
      <img className="landing-hero-image" src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=2400&q=85" alt="Warehouse aisles with organized inventory shelving" loading="eager"/>
      <div className="landing-hero-shade"/>
      <div className="landing-hero-content">
        <span className="landing-kicker"><i/> STOCK. PEOPLE. PERFORMANCE.</span>
        <h1 id="landing-title">StockPulse</h1>
        <p className="landing-hero-copy">A clearer way to run inventory and the work around it.</p>
        <p className="landing-hero-detail">Bring products, purchasing, sales, staff, and payroll into one connected operating workspace.</p>
        <div className="landing-hero-actions">
          <button className="landing-primary-action" onClick={onOpenDashboard}>Sign in to continue <ArrowRight size={16}/></button>
          <a className="landing-secondary-action" href="#platform">Explore the platform <ArrowDown size={15}/></a>
        </div>
        <div className="landing-hero-index"><span>BUILT FOR DAILY OPERATIONS</span><b>01 / 03</b></div>
      </div>
      <div className="landing-hero-caption"><span>ONE OPERATING PICTURE</span><span>INVENTORY · PEOPLE · FINANCE</span></div>
    </section>

    <section className="landing-platform" id="platform">
      <div className="landing-section-intro">
        <span className="landing-section-kicker">THE OPERATIONS PLATFORM</span>
        <h2>Know what’s moving.<br/>Know what needs attention.</h2>
        <p>From the stockroom to the payroll run, keep the day’s essential work connected and visible.</p>
      </div>
      <div className="landing-capabilities" id="workflows">
        <article className="landing-capability">
          <span className="landing-capability-number">01</span>
          <span className="landing-capability-icon stock"><Boxes size={19}/></span>
          <h3>Inventory &amp; purchasing</h3>
          <p>Track products, suppliers, incoming orders, and stock movement in one place.</p>
        </article>
        <article className="landing-capability">
          <span className="landing-capability-number">02</span>
          <span className="landing-capability-icon people"><Users size={19}/></span>
          <h3>People &amp; payroll</h3>
          <p>Keep staff records, attendance, daily wages, and monthly payroll together.</p>
        </article>
        <article className="landing-capability">
          <span className="landing-capability-number">03</span>
          <span className="landing-capability-icon insight"><ChartNoAxesCombined size={19}/></span>
          <h3>Sales &amp; oversight</h3>
          <p>Connect customer activity, expenses, and reporting to everyday decisions.</p>
        </article>
      </div>
    </section>

    <section className="landing-bottom-cta">
      <div><span><ShieldCheck size={15}/> STOCKPULSE WORKSPACE</span><h2>Bring the day into focus.</h2></div>
      <button onClick={onOpenDashboard}>Enter StockPulse <ArrowRight size={16}/></button>
    </section>
    <footer className="landing-footer"><span>StockPulse Operations</span><span>Inventory · Workforce · Finance</span></footer>
  </main>;
}