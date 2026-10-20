"use client";
import { useState } from "react";
import Image from "next/image";
import { waLink } from "@/lib/content";

/** La frase tiene un hueco, y el hueco es el formulario. Abre WhatsApp con el mensaje armado. */
export function Cta() {
  const [school, setSchool] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = school.trim();
    const text = name
      ? `Hola, mi escuela se llama ${name} y quiero una demo de EvoluGK.`
      : "Hola, quiero una demo de EvoluGK para mi escuela de arqueros.";
    window.open(waLink(text), "_blank", "noopener,noreferrer");
  };

  return (
    <section id="demo" className="panel cta" aria-label="Pedí una demo">
      <div className="fill cta-fill">
        <Image src="/img/arquero-atajada.jpg" alt="" fill sizes="100vw" style={{ objectPosition: "50% 30%" }} />
      </div>
      <div className="scrim scrim-b" />
      <div className="scrim scrim-flat" />
      <form className="cta-in wrap" onSubmit={submit}>
        <p className="cta-sentence display">
          <span className="cta-line">
            Mi escuela es
            <label className="cta-field">
              <span className="sr-only">Nombre de tu escuela</span>
              <input type="text" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="su nombre" autoComplete="organization" enterKeyHint="send" />
            </label>
          </span>
          <span className="cta-line">
            y quiero una <button type="submit" className="cta-btn">demo</button>
          </span>
        </p>
        <p className="cta-after">Te abre WhatsApp con el mensaje listo. Te respondemos para coordinar una demo de 20 minutos.</p>
      </form>
    </section>
  );
}
