/**
 * Professional Export to PDF (Feature 8).
 *
 * Strategy: build a fully self-contained, magazine-style HTML document in a
 * hidden iframe, then trigger the browser's native print dialog so the user
 * can save it as a PDF.  This keeps the dependency footprint at zero
 * (no jsPDF, no headless browsers) while producing a beautifully typeset
 * souvenir document on every platform — A4 by default.
 *
 * The exported document is intentionally non-interactive: no buttons, no
 * navigation, no editing controls — just the timeline, key metadata, and the
 * hotel anchor for each day. This is the "Printable Souvenir" mandate in the
 * planning doc.
 */

import { buildTimeBlocksForDay } from "./timeBlocks";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDaySection(dayNumber, places, options) {
  const blocks = buildTimeBlocksForDay(places, options);
  const itemsHtml = blocks
    .map((block) => {
      const place = block.place;
      const meta = [
        place.category,
        place.city,
        place.rating ? `Rating ${Number(place.rating).toFixed(1)}` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      return `
        <article class="pdf-block">
          <div class="pdf-block__rail">
            <span class="pdf-block__dot"></span>
          </div>
          <div class="pdf-block__body">
            <p class="pdf-block__time">${escapeHtml(block.startLabel)} – ${escapeHtml(block.endLabel)}</p>
            <h3 class="pdf-block__name">${escapeHtml(place.name || "Stop")}</h3>
            ${meta ? `<p class="pdf-block__meta">${escapeHtml(meta)}</p>` : ""}
            ${
              block.travelMinutes
                ? `<p class="pdf-block__transit">${escapeHtml(block.travelLabel)} from previous stop</p>`
                : ""
            }
            ${place.why ? `<p class="pdf-block__why">${escapeHtml(place.why)}</p>` : ""}
          </div>
        </article>
      `;
    })
    .join("");

  const hotel = (options.hotelsByDay || {})[dayNumber];
  const hotelHtml = hotel
    ? `
      <section class="pdf-hotel">
        <p class="pdf-kicker">Suggested basecamp · Day ${dayNumber}</p>
        <h4>${escapeHtml(hotel.name)}</h4>
        <p>${escapeHtml(hotel.pitch || "")}</p>
        <p class="pdf-meta">Estimated nightly rate: ₱${Number(hotel.est_price_php || 0).toLocaleString("en-PH")} · ${escapeHtml(hotel.price_band || "Comfort")}</p>
      </section>
    `
    : "";

  return `
    <section class="pdf-day">
      <header class="pdf-day__header">
        <span class="pdf-kicker">Day ${dayNumber}</span>
        <h2>${escapeHtml(options.destination || "Your Itinerary")}</h2>
      </header>
      <div class="pdf-day__timeline">${itemsHtml}</div>
      ${hotelHtml}
    </section>
  `;
}

function buildDocumentHtml(trip, options) {
  const days = Object.keys(trip.itinerary || {})
    .map((value) => Number(value))
    .sort((left, right) => left - right);

  const sectionsHtml = days
    .map((dayNumber) => renderDaySection(dayNumber, trip.itinerary[dayNumber] || [], options))
    .join("");

  const preferences = Array.isArray(trip.preferences)
    ? trip.preferences.join(" · ")
    : String(trip.preferences || "");

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Anotara — ${escapeHtml(trip.destination || "Itinerary")}</title>
      <style>
        @page { size: A4; margin: 18mm 16mm; }
        * { box-sizing: border-box; }
        body {
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif;
          color: #1b1730;
          background: #fff;
          margin: 0;
          line-height: 1.5;
        }
        h1, h2, h3, h4 {
          font-family: "Cormorant Garamond", Georgia, serif;
          font-weight: 600;
          margin: 0;
          color: #1b1730;
        }
        .pdf-cover {
          padding: 24px 0 16px;
          border-bottom: 1px solid rgba(74, 58, 138, 0.18);
          margin-bottom: 22px;
        }
        .pdf-cover h1 {
          font-size: 38px;
          letter-spacing: -0.01em;
          background: linear-gradient(135deg, #4a3a8a 0%, #c44f8a 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .pdf-kicker {
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-size: 10px;
          font-weight: 700;
          color: #6a6285;
        }
        .pdf-meta-row {
          display: flex;
          flex-wrap: wrap;
          gap: 18px;
          margin-top: 8px;
          font-size: 13px;
        }
        .pdf-day {
          margin-bottom: 26px;
          page-break-inside: avoid;
        }
        .pdf-day__header {
          margin-bottom: 12px;
        }
        .pdf-day__header h2 {
          font-size: 24px;
          margin-top: 2px;
        }
        .pdf-day__timeline {
          display: flex;
          flex-direction: column;
        }
        .pdf-block {
          position: relative;
          display: grid;
          grid-template-columns: 28px 1fr;
          gap: 12px;
          padding: 8px 0;
          page-break-inside: avoid;
        }
        .pdf-block__rail {
          position: relative;
          display: flex;
          justify-content: center;
        }
        .pdf-block__rail::before {
          content: "";
          position: absolute;
          top: 0;
          bottom: -8px;
          left: 50%;
          width: 2px;
          background: linear-gradient(180deg, #4a3a8a, #c44f8a);
          transform: translateX(-50%);
        }
        .pdf-block__dot {
          position: relative;
          width: 12px;
          height: 12px;
          margin-top: 4px;
          border-radius: 50%;
          background: #fff;
          border: 3px solid #c44f8a;
          z-index: 1;
        }
        .pdf-block__time {
          margin: 0;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #4a3a8a;
          font-weight: 700;
        }
        .pdf-block__name {
          margin: 2px 0 2px;
          font-size: 16px;
        }
        .pdf-block__meta,
        .pdf-block__transit,
        .pdf-block__why {
          margin: 0;
          font-size: 12px;
          color: #3a3450;
        }
        .pdf-block__transit {
          color: #6a6285;
          font-style: italic;
        }
        .pdf-hotel {
          margin-top: 16px;
          padding: 12px 14px;
          border: 1px solid rgba(74, 58, 138, 0.25);
          border-radius: 12px;
          background: rgba(252, 213, 227, 0.18);
        }
        .pdf-hotel h4 {
          margin: 4px 0 4px;
          font-size: 15px;
        }
        .pdf-hotel p {
          margin: 0;
          font-size: 12px;
          color: #3a3450;
        }
        .pdf-footer {
          margin-top: 30px;
          padding-top: 12px;
          border-top: 1px solid rgba(74, 58, 138, 0.18);
          font-size: 10.5px;
          color: #6a6285;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <section class="pdf-cover">
        <p class="pdf-kicker">Ano Tara — Souvenir Itinerary</p>
        <h1>${escapeHtml(trip.destination || "Your journey")}</h1>
        <div class="pdf-meta-row">
          <span><strong>${escapeHtml(String(trip.numDays || trip.num_days || days.length || 1))}</strong> days</span>
          <span>Pacing · ${escapeHtml(trip.pacingStyle || trip.pacing_style || "Moderate")}</span>
          <span>Transport · ${escapeHtml(trip.transportMode || trip.transport_mode || "Public")}</span>
          <span>Tier · ${escapeHtml(trip.budget || "comfort")}</span>
          ${preferences ? `<span>Vibes · ${escapeHtml(preferences)}</span>` : ""}
        </div>
      </section>
      ${sectionsHtml}
      <footer class="pdf-footer">
        Printed from Ano Tara — your Philippine travel companion. anotara.app
      </footer>
    </body>
  </html>`;
}

/**
 * Generates a hidden iframe with the styled itinerary HTML and triggers the
 * browser's native "Save as PDF" dialog.  The iframe is removed once the
 * print dialog is closed so the document tree stays clean.
 */
export function exportItineraryToPdf(trip, options = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const html = buildDocumentHtml(trip, {
    destination: trip.destination,
    pacingStyle: trip.pacingStyle || trip.pacing_style,
    transportMode: trip.transportMode || trip.transport_mode,
    hotelsByDay: options.hotelsByDay || {},
    dayStart: options.dayStart,
  });

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "Anotara itinerary export");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }, 400);
  };

  const printWindow = iframe.contentWindow;
  if (!printWindow) {
    cleanup();
    return;
  }

  printWindow.focus();
  printWindow.onafterprint = cleanup;

  setTimeout(() => {
    try {
      printWindow.print();
    } catch {
      cleanup();
    }
  }, 250);
}
