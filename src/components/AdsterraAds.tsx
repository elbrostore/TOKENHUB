
import { useEffect, useRef } from "react";

type AdSize = "728x90" | "300x250" | "160x300";

type AdConfig = {
  key: string;
  width: number;
  height: number;
};

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

const AD_UNITS: Record<AdSize, AdConfig> = {
  "728x90": {
    key: "ba1d7827074b6bf85408c15b05f23fb4",
    width: 728,
    height: 90,
  },
  "300x250": {
    key: "b6007e06afdeafcbd0fb80ba9614757c",
    width: 300,
    height: 250,
  },
  "160x300": {
    key: "35f067f7b0bd03f66149ecc1d6e7968c",
    width: 160,
    height: 300,
  },
};

// Load ad scripts one by one to avoid atOptions conflicts.
let adLoadQueue: Promise<void> = Promise.resolve();

function AdsterraAd({ size }: { size: AdSize }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ad = AD_UNITS[size];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    adLoadQueue = adLoadQueue.then(
      () =>
        new Promise<void>((resolve) => {
          if (cancelled || !container.isConnected) {
            resolve();
            return;
          }

          container.replaceChildren();

          window.atOptions = {
            key: ad.key,
            format: "iframe",
            height: ad.height,
            width: ad.width,
            params: {},
          };

          const script = document.createElement("script");
          script.src = `https://bauval.org/22/${ad.key}`;
          script.async = true;

          script.onload = () => resolve();
          script.onerror = () => resolve();

          container.appendChild(script);
        })
    );

    return () => {
      cancelled = true;
      container.replaceChildren();
    };
  }, [ad.key, ad.height, ad.width]);

  return (
    <div className="adsterra-unit">
      <div className="adsterra-label">ADVERTISEMENT</div>

      <div
        ref={containerRef}
        className="adsterra-banner"
        style={{
          width: "100%",
          maxWidth: ad.width,
          minHeight: ad.height,
          margin: "0 auto",
          overflow: "hidden",
        }}
      />
    </div>
  );
}

export function AdsterraAdTop() {
  return <AdsterraAd size="728x90" />;
}

export function AdsterraAdsBottom() {
  return (
    <div className="adsterra-placements">
      <AdsterraAd size="300x250" />
      <AdsterraAd size="160x300" />
    </div>
  );
}
