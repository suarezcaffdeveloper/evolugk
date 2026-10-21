import { describe, expect, it, vi } from "vitest";
import { DEFAULT_EMAIL_FROM, getAppUrl, getEmailConfig } from "../config";
import { escapeHtml, invitationEmail, passwordResetEmail } from "./templates";
import { createConfiguredTransport, createResendTransport } from "./transport";

const MESSAGE = { to: "ana@example.com", subject: "Asunto", html: "<p>hola</p>", text: "hola" };
const KEY = "re_clave_secreta_de_prueba";

function fakeFetch(response: { status: number; body?: unknown }) {
  return vi.fn(
    async () => new Response(JSON.stringify(response.body ?? {}), { status: response.status }),
  );
}

describe("createResendTransport", () => {
  it("manda el mail con la clave en la cabecera y devuelve el id", async () => {
    const fetchImpl = fakeFetch({ status: 200, body: { id: "msg_123" } });
    const send = createResendTransport({ apiKey: KEY, from: "EvoluGK <a@b.com>", fetchImpl });

    expect(await send(MESSAGE)).toEqual({ ok: true, id: "msg_123" });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(init.body as string)).toEqual({
      from: "EvoluGK <a@b.com>",
      to: ["ana@example.com"],
      subject: "Asunto",
      html: "<p>hola</p>",
      text: "hola",
    });
  });

  it("informa un rechazo de Resend sin filtrar la clave", async () => {
    const fetchImpl = fakeFetch({
      status: 422,
      body: { name: "validation_error", message: "Dominio no verificado" },
    });
    const result = await createResendTransport({ apiKey: KEY, from: "x", fetchImpl })(MESSAGE);
    expect(result).toMatchObject({ ok: false, reason: "rejected" });
    expect(JSON.stringify(result)).toContain("Dominio no verificado");
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("no lanza si falla la red: lo informa", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const result = await createResendTransport({ apiKey: KEY, from: "x", fetchImpl })(MESSAGE);
    expect(result).toEqual({ ok: false, reason: "network_error", detail: "TypeError" });
  });

  it("tolera una respuesta que no es JSON", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>error</html>", { status: 502 }));
    const result = await createResendTransport({ apiKey: KEY, from: "x", fetchImpl })(MESSAGE);
    expect(result).toMatchObject({ ok: false, reason: "rejected" });
  });
});

describe("createConfiguredTransport", () => {
  it("sin RESEND_API_KEY no manda nada y lo informa (la interfaz muestra el link)", async () => {
    const result = await createConfiguredTransport({} as NodeJS.ProcessEnv)(MESSAGE);
    expect(result).toEqual({ ok: false, reason: "not_configured" });
  });
});

describe("configuración", () => {
  it("usa el remitente de prueba de Resend por defecto", () => {
    expect(getEmailConfig({} as NodeJS.ProcessEnv)).toEqual({
      apiKey: null,
      from: DEFAULT_EMAIL_FROM,
    });
  });

  it("toma la clave y el remitente del entorno", () => {
    const env = {
      RESEND_API_KEY: " re_x ",
      EMAIL_FROM: "Escuela <no-reply@escuela.com>",
    } as unknown as NodeJS.ProcessEnv;
    expect(getEmailConfig(env)).toEqual({ apiKey: "re_x", from: "Escuela <no-reply@escuela.com>" });
  });

  it("APP_URL: sin barra final, y por defecto localhost solo fuera de producción", () => {
    expect(
      getAppUrl({ APP_URL: "https://app.evolugk.com///" } as unknown as NodeJS.ProcessEnv),
    ).toBe("https://app.evolugk.com");
    expect(getAppUrl({ NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv)).toBe(
      "http://localhost:3000",
    );
    expect(() => getAppUrl({ NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv)).toThrow(
      /APP_URL/,
    );
  });
});

describe("escapeHtml", () => {
  it("neutraliza etiquetas y comillas", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;",
    );
  });
});

describe("plantillas", () => {
  const link = "https://app.example.com/escuela/invitacion/abc123";
  const base = { to: "ana@example.com", schoolName: "Guantes del Sur", link };

  it("la invitación incluye el link, el rol, el vencimiento y la marca", () => {
    const mail = invitationEmail({
      ...base,
      role: "coach",
      expiresAt: new Date("2026-10-28T15:00:00Z"),
      accentColor: "#1D4ED8",
    });
    expect(mail.subject).toBe("Te invitaron a Guantes del Sur en EvoluGK");
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain(link);
      expect(part).toContain("Profesor");
      expect(part).toContain("28 de octubre de 2026");
    }
    expect(mail.html).toContain("#1D4ED8"); // color de la escuela en el botón
    expect(mail.to).toBe("ana@example.com");
  });

  it("la invitación de administración dice el rol que corresponde", () => {
    const mail = invitationEmail({
      ...base,
      role: "school_admin",
      expiresAt: new Date("2026-10-28T15:00:00Z"),
    });
    expect(mail.text).toContain("Administración");
  });

  it("escapa el nombre de la escuela en el HTML, pero no en el texto plano ni en el asunto", () => {
    const evil = `Escuela <img src=x onerror=alert(1)> & Co`;
    const mail = invitationEmail({
      ...base,
      schoolName: evil,
      role: "coach",
      expiresAt: new Date("2026-10-28T15:00:00Z"),
    });
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img src=x onerror=alert(1)&gt; &amp; Co");
    expect(mail.text).toContain(evil);
    expect(mail.subject).toContain(evil);
  });

  it("escapa también el link", () => {
    const mail = passwordResetEmail({ ...base, link: `https://x.com/?a=1&b="2"` });
    expect(mail.html).toContain("a=1&amp;b=&quot;2&quot;");
  });

  it("si el color de la escuela es inválido usa el del producto", () => {
    const mail = passwordResetEmail({ ...base, accentColor: "no-es-un-color" });
    expect(mail.html).toContain("#C2410C");
  });

  it("ajusta un color de escuela sin contraste (amarillo) para que el botón se lea", () => {
    const mail = passwordResetEmail({ ...base, accentColor: "#FACC15" });
    expect(mail.html).not.toContain("background:#FACC15");
  });

  it("la recuperación avisa que el link vence en 1 hora y trae el link en texto", () => {
    const mail = passwordResetEmail(base);
    expect(mail.subject).toBe("Restablecé tu contraseña de Guantes del Sur");
    expect(mail.text).toContain("1 hora");
    expect(mail.text).toContain(link);
  });
});
