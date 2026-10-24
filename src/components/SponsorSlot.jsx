import { useState } from "react";
import { config } from "../config.js";

// Reserved 160 x 48 area (MI-4). It keeps its size with or without a logo, so adding one shifts nothing.
export default function SponsorSlot() {
  const [broken, setBroken] = useState(false);
  const show = config.sponsorLogo && !broken;
  return (
    <div data-testid="sponsor-slot" className="flex h-12 w-40 items-center" aria-hidden={show ? undefined : true}>
      {show && (
        <img
          src={config.sponsorLogo}
          alt="Sponsor"
          className="max-h-12 max-w-40 object-contain"
          onError={() => setBroken(true)}
        />
      )}
    </div>
  );
}
