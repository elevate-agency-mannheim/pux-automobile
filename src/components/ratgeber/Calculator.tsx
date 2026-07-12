import { useMemo, useState } from "react";

// Prices match the real packages shown on the PUX Automobile homepage (/#pakete).
// No invented figures — this mirrors the actual priced offerings.
const PACKAGES = [
  { id: "innen", label: "Innenreinigung", price: 130 },
  { id: "aussen", label: "Außenreinigung", price: 90 },
  { id: "komplett", label: "Komplettpaket", price: 220 },
] as const;

const EXTRA_SERVICE = { label: "Polieren + Keramikversiegelung", price: 350 };

export default function Calculator() {
  const [selected, setSelected] = useState<(typeof PACKAGES)[number]["id"]>("komplett");
  const [extra, setExtra] = useState(false);

  const pkg = useMemo(() => PACKAGES.find((p) => p.id === selected)!, [selected]);
  const extraAllowed = selected !== "komplett"; // included free in Komplettpaket
  const total = pkg.price + (extra && extraAllowed ? EXTRA_SERVICE.price : 0);

  return (
    <div className="reveal not-prose my-10 rounded-3xl border border-gray-100 bg-white shadow-sm p-6 md:p-8">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: "linear-gradient(135deg,#1B2B6B,#3A7BD5)" }}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V13.5Zm0 2.25h.008v.008H8.25v-.008Zm2.25-4.5h.008v.008H10.5v-.008Zm0 2.25h.008v.008H10.5V13.5Zm0 2.25h.008v.008H10.5v-.008Zm2.25-4.5h.008v.008H12.75v-.008Zm0 2.25h.008v.008H12.75V13.5Zm0 2.25h.008v.008H12.75v-.008ZM17.25 9v11.25a2.25 2.25 0 0 1-2.25 2.25h-6a2.25 2.25 0 0 1-2.25-2.25V9m10.5 0a2.25 2.25 0 0 0-2.25-2.25h-6A2.25 2.25 0 0 0 6.75 9m10.5 0V6.75A2.25 2.25 0 0 0 15 4.5H9a2.25 2.25 0 0 0-2.25 2.25V9" />
          </svg>
        </span>
        <h3 className="font-bold text-gray-900 text-lg">Aufbereitungskosten-Rechner</h3>
      </div>
      <p className="text-sm text-gray-500 mb-6">Wählen Sie Ihr Paket, um eine ca.-Preisschätzung zu erhalten.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {PACKAGES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(p.id)}
            className={`text-left border-2 rounded-xl px-4 py-3.5 transition-all ${
              selected === p.id ? "border-[#3A7BD5] bg-[#EEF3FB]" : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <span className="block text-sm font-semibold text-gray-900">{p.label}</span>
            <span className="block text-xs text-gray-500 mt-0.5">ab {p.price} €</span>
          </button>
        ))}
      </div>

      <label
        className={`flex items-center gap-3 border-2 rounded-xl px-4 py-3.5 mb-6 transition-all ${
          extraAllowed ? "cursor-pointer border-gray-200 hover:border-gray-300" : "cursor-not-allowed border-gray-100 opacity-50"
        } ${extra && extraAllowed ? "border-[#3A7BD5] bg-[#EEF3FB]" : ""}`}
      >
        <input
          type="checkbox"
          className="w-4 h-4 rounded border-gray-300 accent-[#3A7BD5] flex-shrink-0"
          checked={extra && extraAllowed}
          disabled={!extraAllowed}
          onChange={(e) => setExtra(e.target.checked)}
        />
        <span className="text-sm text-gray-700">
          + Extra-Service: {EXTRA_SERVICE.label}
          {extraAllowed ? ` (${EXTRA_SERVICE.price} €)` : " (im Komplettpaket bereits kostenlos enthalten)"}
        </span>
      </label>

      <div className="flex items-center justify-between rounded-2xl p-5" style={{ background: "linear-gradient(135deg,#1B2B6B,#3A7BD5)" }}>
        <span className="text-white font-medium text-sm">Ca.-Preisschätzung</span>
        <span className="text-white font-extrabold text-2xl">ab {total} €</span>
      </div>
      <p className="text-xs text-gray-400 mt-3 leading-relaxed">
        Richtwert inkl. MwSt. auf Basis unserer Standardpakete. Der genaue Preis hängt von Fahrzeuggröße und
        Verschmutzungsgrad ab und wird bei der Terminbestätigung final bestätigt.
      </p>
    </div>
  );
}
