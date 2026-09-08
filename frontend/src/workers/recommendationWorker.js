// Web Worker inspirado diretamente no modelTrainingWorker.js do projeto de
// e-commerce que serviu de referência: treina uma rede neural pequena
// (TensorFlow.js) fora da thread principal, para não travar a UI.
//
// O que muda aqui em relação ao original: lá, TODA a recomendação vinha da
// rede. Aqui o Qdrant já filtrou o catálogo (milhares de títulos) para um
// punhado de candidatos plausíveis por similaridade de vetor — a rede
// treina em cima disso e faz o re-ranking final, exatamente como um estágio
// de "retrieval + ranking" de um recomendador de verdade.
//
// Entrada (postMessage): { genres, userVector, items, negativeSamples }
//   - items: candidatos vindos do Qdrant (rótulo implícito = 1, "relevante")
//   - negativeSamples: amostra aleatória do catálogo (rótulo implícito = 0)
// Saída: { items: [...items reordenados com tfScore], trained, epochs, finalLoss, finalAccuracy }

import * as tf from '@tensorflow/tfjs';
import { buildMovieVector, vectorSize } from '../ml/vectorizer.js';

const EPOCHS = 40;
const MIN_EXAMPLES = 5;

self.onmessage = async (event) => {
  const { genres, userVector, items, negativeSamples } = event.data;

  if (!items?.length || items.length < MIN_EXAMPLES || (negativeSamples || []).length < MIN_EXAMPLES) {
    // Poucos dados pra treinar algo útil — devolve na ordem que já veio
    // (por similaridade de cosseno do Qdrant) em vez de forçar um modelo.
    self.postMessage({ items, trained: false });
    return;
  }

  let xs;
  let ys;
  let candidateTensor;
  let predictions;
  let model;

  try {
    const dim = vectorSize(genres);

    const positiveVectors = items.map((m) => [...userVector, ...buildMovieVector(m, genres)]);
    const negativeVectors = negativeSamples.map((m) => [...userVector, ...buildMovieVector(m, genres)]);

    xs = tf.tensor2d([...positiveVectors, ...negativeVectors]);
    ys = tf.tensor2d([...positiveVectors.map(() => [1]), ...negativeVectors.map(() => [0])]);

    // Rede pequena de propósito: o vetor de entrada já é uma representação
    // compacta (gêneros + ano + nota + tipo + classificação), não pixels
    // nem texto cru — não precisa de uma rede grande pra aprender o padrão.
    model = tf.sequential();
    model.add(tf.layers.dense({ inputShape: [dim * 2], units: 32, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
    model.compile({ optimizer: tf.train.adam(0.01), loss: 'binaryCrossentropy', metrics: ['accuracy'] });

    const history = await model.fit(xs, ys, {
      epochs: EPOCHS,
      batchSize: 32,
      shuffle: true,
      verbose: 0,
    });

    candidateTensor = tf.tensor2d(positiveVectors);
    predictions = model.predict(candidateTensor);
    const scores = await predictions.data();

    const ranked = items
      .map((m, i) => ({ ...m, tfScore: Math.round(scores[i] * 1000) / 1000 }))
      .sort((a, b) => b.tfScore - a.tfScore);

    const accKey = Object.keys(history.history).find((k) => k.includes('acc'));
    const finalLoss = history.history.loss[history.history.loss.length - 1];
    const finalAccuracy = accKey ? history.history[accKey][history.history[accKey].length - 1] : null;

    self.postMessage({
      items: ranked,
      trained: true,
      epochs: EPOCHS,
      finalLoss,
      finalAccuracy,
    });
  } catch (err) {
    self.postMessage({ error: err.message, items, trained: false });
  } finally {
    xs?.dispose();
    ys?.dispose();
    candidateTensor?.dispose();
    predictions?.dispose();
    model?.dispose();
  }
};
