import anoTaraIconDark from "../../assets/Ano-Tara Icon dark.png";
import anoTaraIconLight from "../../assets/Ano-Tara Icon light.png";
import anoTaraLogo from "../../assets/Ano-Tara logo.png";

/**
 * The Ano-Tara! brand lockup. Icon mode switches between light/dark assets
 * with CSS, while full mode uses the supplied complete system logo.
 */
export default function BrandLogo({ size = 28, showWordmark = true, variant = "icon" }) {
  if (variant === "full") {
    return (
      <span className="brand-logo brand-logo--full" aria-label="Ano-Tara!">
        <img
          src={anoTaraLogo}
          alt="Ano-Tara! Philippine Travel App"
          className="brand-logo__full"
          width={size}
        />
      </span>
    );
  }

  return (
    <span className="brand-logo" aria-label="Ano-Tara!">
      <img
        src={anoTaraIconLight}
        alt=""
        aria-hidden="true"
        className="brand-logo__glyph brand-logo__glyph--light"
        width={size}
        height={size}
      />
      <img
        src={anoTaraIconDark}
        alt=""
        aria-hidden="true"
        className="brand-logo__glyph brand-logo__glyph--dark"
        width={size}
        height={size}
      />
      {showWordmark ? (
        <span className="brand-logo__wordmark">Ano-Tara!</span>
      ) : null}
    </span>
  );
}
