import type { LinksFunction, MetaFunction } from "@remix-run/node";
import { useLocation } from "@remix-run/react";
import landingStyles from "../styles/landing.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: landingStyles }];

export const meta: MetaFunction = () => [
  { title: "Decisions for Shopify | Fewer alerts. Better profit decisions." },
  {
    name: "description",
    content:
      "Decisions analyses your Shopify orders and shows 1–3 actions only when the numbers justify it. Transparent maths, clear impact, and outcome tracking.",
  },
];

export default function Index() {
  const location = useLocation();
  const search = location.search;
  const appUrl = `/app${search}`;

  return (
    <div className="landing">
      <header className="nav">
        <div className="brand">
          <span className="brand__logo" aria-hidden="true">
            D
          </span>
          <span className="brand__name">Decisions</span>
        </div>

        <nav className="nav__actions" aria-label="Primary">
          <a className="button button--ghost" href="#how">
            How it works
          </a>
          <a className="button button--ghost" href="#proof">
            Proof
          </a>
          <a className="button button--primary" href={appUrl}>
            Open app
          </a>
        </nav>
      </header>

      <main className="main">
        <section className="hero">
          <div className="hero__copy">
            <p className="eyebrow">Built for restraint</p>
            <h1>Only interrupt when it matters.</h1>

            <p className="lead">
              Decisions reads your Shopify orders and shows <strong>1–3</strong> profit decisions
              only when the numbers justify it. No dashboards, no filler.
            </p>

            <div className="hero__bullets" role="list">
              <div className="bullet" role="listitem">
                <strong>Proof-first</strong>
                <span>Every decision has the numbers behind it.</span>
              </div>
              <div className="bullet" role="listitem">
                <strong>Quiet by default</strong>
                <span>If the signal is weak, it stays silent.</span>
              </div>
              <div className="bullet" role="listitem">
                <strong>Outcomes</strong>
                <span>When you act, it tracks Before → After.</span>
              </div>
            </div>

            <div className="ctaRow">
              <a className="button button--primary" href={appUrl}>
                Open app
              </a>
              <a className="button button--outline" href="#proof">
                See an example
              </a>
            </div>

            <div className="trustLine">
              <span>Default threshold: decisions ≥ £50/month impact.</span>
              <span>Change it in Settings.</span>
            </div>
          </div>

          <div className="hero__visual" id="proof">
            <div className="card card--decision">
              <div className="card__top">
                <p className="card__label">Decision</p>
                <span className="tag tag--high">High confidence</span>
              </div>

              <h3 className="card__headline">£320/month at risk</h3>

              <p className="card__action">Stop pushing Merino beanie in bundles</p>

              <p className="card__reason">
                Tight margin plus free shipping is dragging net profit below zero in the last 90 days.
              </p>

              <div className="whyNow">
                <span className="whyNow__dot" aria-hidden="true" />
                <span>This got worse in the last 30 days.</span>
              </div>

              <div className="outcome">
                <p className="outcome__label">After you acted</p>
                <div className="outcome__row">
                  <span>Profit per order</span>
                  <strong>−£0.26 → +£0.18</strong>
                </div>
                <div className="outcome__row">
                  <span>Refund rate</span>
                  <strong>12% → 6%</strong>
                </div>
                <div className="outcome__row">
                  <span>Shipping loss per order</span>
                  <strong>£1.10 → £0.60</strong>
                </div>
                <p className="outcome__verdict">Outcome: improved over 30 days.</p>
              </div>
            </div>

            <div className="card card--numbers">
              <p className="card__label">See numbers</p>

              <div className="numbers">
                <div>
                  <span>Revenue</span>
                  <strong>£984</strong>
                </div>
                <div>
                  <span>COGS</span>
                  <strong>£902</strong>
                </div>
                <div>
                  <span>Discounts</span>
                  <strong>£0</strong>
                </div>
                <div>
                  <span>Refunds</span>
                  <strong>£0</strong>
                </div>
                <div>
                  <span>Estimated shipping</span>
                  <strong>£71.75</strong>
                </div>

                <div className="numbers__total">
                  <span>Net profit</span>
                  <strong className="neg">−£10.25</strong>
                </div>
              </div>

              <p className="numbers__note">
                Shipping is estimated per order using your assumption. Refunds are counted when processed.
              </p>
            </div>
          </div>
        </section>

        <section className="section" id="how">
          <div className="section__header">
            <h2>How it works</h2>
            <p>Simple flow. Clear outputs. Minimal noise.</p>
          </div>

          <div className="steps">
            <div className="step">
              <span className="step__num">01</span>
              <h3>Read orders</h3>
              <p>Analyses recent orders, discounts, refunds, and shipping behaviour.</p>
            </div>

            <div className="step">
              <span className="step__num">02</span>
              <h3>Match costs</h3>
              <p>Uses Shopify costs and your overrides (CSV or manual) to make margin maths usable.</p>
            </div>

            <div className="step">
              <span className="step__num">03</span>
              <h3>Show only signal</h3>
              <p>Surfaces 1–3 decisions when the impact crosses your threshold.</p>
            </div>

            <div className="step">
              <span className="step__num">04</span>
              <h3>Prove outcomes</h3>
              <p>When you mark a decision as done, Decisions tracks Before → After without claiming causality.</p>
            </div>
          </div>
        </section>

        <section className="section section--contrast">
          <div className="section__header">
            <h2>What makes it different</h2>
            <p>Most apps add noise. Decisions reduces it.</p>
          </div>

          <div className="pillGrid">
            <div className="pill">1–3 decisions per run</div>
            <div className="pill">Minimum impact threshold</div>
            <div className="pill">Proof-first numbers</div>
            <div className="pill">Outcome tracking</div>
            <div className="pill">No filler advice</div>
          </div>
        </section>

        <section className="section section--split">
          <div>
            <h2>Made for busy merchants</h2>
            <p>
              Decisions is designed for the way merchants actually work: quick checks, clear stakes, and a calm UI
              that does not demand attention.
            </p>

            <div className="badgeRow">
              <span>Embedded in Shopify Admin</span>
              <span>Polaris UI</span>
              <span>Transparent assumptions</span>
            </div>

            <div className="micro">
              <h3>Decision types</h3>
              <ul>
                <li>Best-seller loss</li>
                <li>Free-shipping trap</li>
                <li>Discount–refund hit</li>
              </ul>
              <p className="micro__note">
                Each decision includes impact, confidence, and the six-metric breakdown.
              </p>
            </div>
          </div>

          <div className="surface">
            <h3 className="surface__title">Quiet by default</h3>
            <p className="surface__lead">
              If the data is thin, Decisions says so. It does not force advice to look busy.
            </p>

            <div className="surface__example">
              <p className="surface__kicker">Example empty state copy</p>
              <p className="surface__quote">
                “We analysed 39 orders. No decisions meet your threshold right now. Showing only decisions ≥ £50/month
                (change in Settings).”
              </p>
            </div>
          </div>
        </section>

        <section className="cta">
          <h2>Ready for fewer alerts and better calls?</h2>
          <p>Open the app and run your first analysis.</p>
          <a className="button button--primary" href={appUrl}>
            Open app
          </a>
          <p className="cta__fine">No promises. Just numbers you can verify.</p>
        </section>
      </main>

      <footer className="footer">
        <span>Decisions for Shopify</span>
        <span>Fewer alerts. Better profit decisions.</span>
      </footer>
    </div>
  );
}
