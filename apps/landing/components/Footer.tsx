import { DEMO_LINK } from "@/lib/content";

const CREDITS = [
  ["Soccer goalkeeper", "Master Sgt. Lance Cheung, U.S. Air Force", "dominio público", "https://commons.wikimedia.org/wiki/File:Soccer_goalkeeper.jpg"],
  ["Jason Peter Jones Goalkeeper Coach", "Jabby1", "CC BY-SA 3.0", "https://commons.wikimedia.org/wiki/File:Jason_Peter_Jones_Goalkeeper_Coach.jpg"],
  ["Goalkeeper Ryan Swain training…", "Loki841990", "CC0", "https://commons.wikimedia.org/wiki/File:Goalkeeper_Ryan_Swain_training_ahead_of_charity_and_celebrity_games_in_2025.jpg"],
  ["Tyler Deric, Houston Dynamo Goalkeeper, Mar 2015", "Nbrooks503", "CC BY-SA 3.0", "https://commons.wikimedia.org/wiki/File:Tyler_Deric,_Houston_Dynamo_Goalkeeper,_Mar_2015.jpg"],
  ["Silhouette goalkeeper catching the ball (Unsplash)", "David Clarke", "CC0", "https://commons.wikimedia.org/wiki/File:Silhouette_goalkeeper_catching_the_ball_(Unsplash).jpg"],
  ["Soccer Youth Goal Keeper", "Torsten Bolten, AFpix.de", "CC BY-SA 3.0", "https://commons.wikimedia.org/wiki/File:Soccer_Youth_Goal_Keeper.jpg"],
  ["Goalkeeper getting ready during a penalty shoot-out", "Gianluca Barbazza", "CC BY 4.0", "https://commons.wikimedia.org/wiki/File:Goalkeeper_getting_ready_during_a_penalty_shoot-out_in_St_Albans,_Hertfordshire_2023.jpg"],
  ["Victor Armenta", "Victor Armenta", "CC BY-SA 3.0", "https://commons.wikimedia.org/wiki/File:Victor_Armenta.jpg"],
  ["Michael Rensing goalkeeper FC Bayern Munich", "Bernd Schrade", "CC BY 2.0", "https://commons.wikimedia.org/wiki/File:Michael_Rensing_goalkeeper_FC_Bayern_Munich.jpg"],
  ["Train like a Real Madrid goalkeeper! (video)", "Real Madrid", "CC BY 3.0", "https://commons.wikimedia.org/wiki/File:Train_like_a_Real_Madrid_goalkeeper!_-_Courtois,_Lunin_%26_Altube.webm"],
];

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <p className="wordmark" role="img" aria-label="EvoluGK">EvoluGK</p>

        <div className="foot-grid">
          <nav className="foot-cols" aria-label="Pie de página">
            <div>
              <h2 className="foot-h">Producto</h2>
              <a href="#funciones">Funciones</a>
              <a href="#evolucion">Evolución</a>
              <a href="#videos">Videos</a>
              <a href="#familias">Familias</a>
            </div>
            <div>
              <h2 className="foot-h">Escuelas</h2>
              <a href="#como-empezar">Cómo empezar</a>
              <a href="#planes">Planes</a>
              <a href="#preguntas">Preguntas</a>
            </div>
            <div>
              <h2 className="foot-h">Confianza</h2>
              <a href="#privacidad">Cuidado de menores</a>
              <a href="#datos">El sistema en números</a>
            </div>
            <div>
              <h2 className="foot-h">Contacto</h2>
              <a href={DEMO_LINK} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              <a href="#demo">Pedí una demo</a>
            </div>
          </nav>
          <div className="foot-contact">
            <p>Hecho en Argentina, para escuelas de arqueros.</p>
            <p className="soft">Respondemos por WhatsApp en horario hábil.</p>
          </div>
        </div>

        <p className="credits">
          Fotos y video:{" "}
          {CREDITS.map(([title, by, lic, href], i) => (
            <span key={href}>
              <a href={href} target="_blank" rel="noopener noreferrer">“{title}”</a> de {by}, {lic}, vía Wikimedia Commons
              {i < CREDITS.length - 1 ? "; " : "."}
            </span>
          ))}
        </p>

        <div className="foot-last">
          <span>© {new Date().getFullYear()} EvoluGK</span>
          <a className="btn small-btn" href={DEMO_LINK} target="_blank" rel="noopener noreferrer">Pedí una demo</a>
        </div>
      </div>
    </footer>
  );
}
