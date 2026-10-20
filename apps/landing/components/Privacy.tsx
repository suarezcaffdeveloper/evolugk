import Image from "next/image";
import { Heading } from "./Heading";

const ITEMS = [
  "Los videos solo se suben con el consentimiento de imagen vigente.",
  "Se reproducen con enlaces firmados que vencen.",
  "Cada escuela ve únicamente sus propios datos.",
  "Todo cambio en la asistencia queda registrado.",
  "Tras 5 intentos fallidos de PIN, el acceso se bloquea 15 minutos.",
];

export function Privacy() {
  return (
    <section id="privacidad" className="panel privacy" aria-label="Cuidado de menores">
      <div className="privacy-photo">
        <Image src="/img/arquero-arco.jpg" alt="Arquero en posición de espera frente al arco" fill sizes="(max-width: 860px) 100vw, 50vw" style={{ objectPosition: "52% 60%" }} />
        <div className="scrim scrim-b" />
      </div>
      <div className="privacy-copy">
        <Heading className="display h-lg">Menores bien cuidados</Heading>
        <ul className="ticks ticks-lg">
          {ITEMS.map((t, i) => (
            <li key={t} className="rv" style={{ "--d": i + 1 } as React.CSSProperties}>
              <span className="bullet" /> {t}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
