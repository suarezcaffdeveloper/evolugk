/**
 * Lee la duración de un archivo de video en el navegador, antes de subirlo (spec 03, RF-02).
 * Rechaza si el formato no se puede leer, que es la señal para avisar de un formato no compatible.
 * Solo para componentes de cliente.
 */
export function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const done = () => URL.revokeObjectURL(url);
    video.onloadedmetadata = () => {
      done();
      if (Number.isFinite(video.duration) && video.duration > 0) resolve(video.duration);
      else reject(new Error("duration"));
    };
    video.onerror = () => {
      done();
      reject(new Error("format"));
    };
    video.src = url;
  });
}
