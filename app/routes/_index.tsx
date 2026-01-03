import type { LinksFunction, MetaFunction } from "@remix-run/node";
import landingStyles from "../styles/landing.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: landingStyles }];

export const meta: MetaFunction = () => [
  { title: "Decisions for Shopify - Profit moves, not guesses" },
  {
    name: "description",
    content:
      "Turn Shopify order data into 1-3 focused profit decisions with clear impact and transparent numbers.",
  },
];

export default function Index() {
  return (
    <div className="landing">
      <header className="landing__nav">
        <div className="landing__brand">
          <span className="landing__logo">D</span>
          <span>Decisions</span>
        </div>
        <nav className="landing__actions">
          <a className="button button--ghost" href="#how-it-works">
            How it works
          </a>
          <a className="button button--primary" href="/app">
            Open in Shopify
          </a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero__content">
            <p className="hero__eyebrow">Profit signals for Shopify stores</p>
            <h1>Decisions that protect your margins.</h1>
            <p className="hero__lead">
              We analyze the last 90 days of orders and return 1-3 specific actions with pound
              impact, confidence, and the exact numbers behind each call.
            </p>
            <div className="hero__cta">
              <a className="button button--primary" href="/app">
                Launch the app
              </a>
              <a className="button button--outline" href="#numbers">
                See the numbers
              </a>
            </div>
            <div className="hero__meta">
              <div>
                <strong>1-3</strong>
                <span>Decisions per run</span>
              </div>
              <div>
                <strong>£ impact</strong>
                <span>Clear monthly stakes</span>
              </div>
              <div>
                <strong>90 days</strong>
                <span>Order history window</span>
              </div>
            </div>
          </div>
          <div className="hero__visual">
            <div className="card card--headline">
              <p className="card__label">Decision</p>
              <h3>£1,240/month at risk</h3>
              <p className="card__action">Raise price on Classic Hoodie by 12%</p>
              <p className="card__reason">
                Made £6,120 revenue but lost £820 after COGS, refunds, and shipping.
              </p>
              <span className="card__confidence">High confidence</span>
            </div>
            <div className="card card--numbers" id="numbers">
              <p className="card__label">See numbers</p>
              <div className="numbers">
                <div>
                  <span>Revenue</span>
                  <strong>£6,120</strong>
                </div>
                <div>
                  <span>COGS</span>
                  <strong>£4,210</strong>
                </div>
                <div>
                  <span>Discounts</span>
                  <strong>£320</strong>
                </div>
                <div>
                  <span>Refunds</span>
                  <strong>£680</strong>
                </div>
                <div>
                  <span>Shipping</span>
                  <strong>£490</strong>
                </div>
                <div className="numbers__total">
                  <span>Net profit</span>
                  <strong>−£820</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="how-it-works">
          <div className="section__header">
            <h2>How Decisions works</h2>
            <p>
              The app connects to Shopify orders, pulls costs, refunds, and discounts, then keeps
              only the strongest signals.
            </p>
          </div>
          <div className="steps">
            <div className="step">
              <span>01</span>
              <h3>Pull order history</h3>
              <p>We analyze the last 90 days with refunds, shipping, and discounts included.</p>
            </div>
            <div className="step">
              <span>02</span>
              <h3>Match product costs</h3>
              <p>COGS from Shopify (or CSV upload) powers accurate margin math.</p>
            </div>
            <div className="step">
              <span>03</span>
              <h3>Surface only signal</h3>
              <p>We show 1-3 decisions with confidence levels and a clear impact number.</p>
            </div>
          </div>
        </section>

        <section className="section section--contrast">
          <div className="section__header">
            <h2>Built for restraint</h2>
            <p>When the data is thin, Decisions stays quiet instead of forcing weak advice.</p>
          </div>
          <div className="pill-grid">
            <div className="pill">Order thresholds required</div>
            <div className="pill">No filler decisions</div>
            <div className="pill">Confidence labels</div>
            <div className="pill">Transparent numbers</div>
          </div>
        </section>

        <section className="section section--split">
          <div>
            <h2>Shopify-native, fast, and clear</h2>
            <p>
              Decisions feels like part of the Shopify Admin, with a focused dashboard, quick
              refresh, and easy settings for shipping assumptions.
            </p>
            <div className="badge-row">
              <span>Embedded Admin app</span>
              <span>Polaris UI</span>
              <span>Real-time refresh</span>
            </div>
          </div>
          <div className="surface">
            <h3>Decision types</h3>
            <ul>
              <li>Best-seller loss</li>
              <li>Free-shipping trap</li>
              <li>Discount-refund hit</li>
            </ul>
            <p>Each card shows action, reason, confidence, and the six-metric breakdown.</p>
          </div>
        </section>

        <section className="cta">
          <h2>Ready to protect your margins?</h2>
          <p>Launch Decisions from Shopify and get your first analysis in minutes.</p>
          <a className="button button--primary" href="/app">
            Open in Shopify
          </a>
        </section>
      </main>

      <footer className="landing__footer">
        <span>Decisions for Shopify</span>
        <span>Built for clear profit moves</span>
      </footer>
    </div>
  );
}
