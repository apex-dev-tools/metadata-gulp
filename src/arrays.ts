// Source: https://gist.github.com/xclusive1111/f47b7340e0ef10dbc8e75e90e7cedc96

export const foldRight =
  <A, B>(xs: Array<A>, zero: B) =>
  (f: (b: B, a: A) => B): B => {
    const len = xs.length;
    if (len == 0) return zero;
    else {
      const last = xs[len - 1];
      const inits = xs.slice(0, len - 1);
      return foldRight(inits, f(zero, last))(f);
    }
  };

export const foldLeft =
  <A, B>(xs: Array<A>, zero: B) =>
  (f: (b: B, a: A) => B): B => {
    const len = xs.length;
    if (len == 0) return zero;
    else {
      const head = xs[0];
      const tails = xs.slice(1);
      return foldLeft(tails, f(zero, head))(f);
    }
  };

export function chunk<A>(xs: Array<A>, chunkSize: number): A[][] {
  const accum = [];
  for (let i = 0; i < xs.length; i += chunkSize)
    accum.push(xs.slice(i, i + chunkSize));
  return accum;
}
