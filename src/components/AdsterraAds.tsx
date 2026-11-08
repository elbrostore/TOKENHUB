type AdSize = "728x90" | "300x250" | "160x300";

const AD_UNITS: Record<
  AdSize,
  { key: string; width: number; height: number }
> = {
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

function AdsterraAd({ size }: { size: AdSize }) {
  const ad = AD_UNITS[size];

  const srcDoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent;
}
.ad-container {
  width: ${ad.width}px;
  height: ${ad.height}px;
  margin: 0 auto;
}
</style>
</head>
<body>
<div class="ad-container"></div>
<script>
var atOptions = {
  'key': '${ad.key}',
  'format': 'iframe',
  'height': ${ad.height},
  'width': ${ad.width},
  'params': {}
};
</script>
<script src="https://bauval.org/22/${ad.key}"></script>
</body>
</html>`;

  return (
    <div className="adsterra-unit">
      <div className="adsterra-label">ADVERTISEMENT</div>
      <iframe
        title={`Advertisement ${size}`}
        srcDoc={srcDoc}
        width={ad.width}
        height={ad.height}
        loading="lazy"
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="strict-origin-when-cross-origin"
        style={{
          display: "block",
          maxWidth: "100%",
          border: 0,
          margin: "0 auto",
        }}
      />
    </div>
  );
}

export function AdsterraAds() {
  return (
    <div className="adsterra-placements">
      <AdsterraAd size="728x90" />
      <AdsterraAd size="300x250" />
      <AdsterraAd size="160x300" />
    </div>
  );
}