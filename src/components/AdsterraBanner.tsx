import { useEffect, useRef } from "react";

declare global {
  interface Window {
    atOptions?: {
      key: string;
      format: string;
      height: number;
      width: number;
      params: Record<string, never>;
    };
  }
}

export function AdsterraBanner() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || container.dataset.loaded === "true") return;

    container.dataset.loaded = "true";

    window.atOptions = {
      key: "ba1d7827074b6bf85408c15b05f23fb4",
      format: "iframe",
      height: 90,
      width: 728,
      params: {},
    };

    const script = document.createElement("script");
    script.src =
      "https://bauval.org/22/ba1d7827074b6bf85408c15b05f23fb4";
    script.async = true;

    container.appendChild(script);

    return () => {
      container.replaceChildren();
      container.dataset.loaded = "false";
    };
  }, []);

  return (
    <div className="adsterra-banner-wrap">
      <div className="adsterra-label">ADVERTISEMENT</div>
      <div ref={containerRef} className="adsterra-banner" />
    </div>
  );
}