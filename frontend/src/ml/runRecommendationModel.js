// Instancia o Web Worker de treinamento (ver ../workers/recommendationWorker.js)
// e expõe como uma Promise simples de usar a partir de um componente React.
export function runRecommendationModel({ genres, userVector, items, negativeSamples }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/recommendationWorker.js', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (event) => {
      worker.terminate();
      if (event.data.error && !event.data.items) reject(new Error(event.data.error));
      else resolve(event.data);
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    worker.postMessage({ genres, userVector, items, negativeSamples });
  });
}
