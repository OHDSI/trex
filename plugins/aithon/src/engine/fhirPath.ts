export type PathSeg = string | number;

export function getAt(obj: any, path: PathSeg[]): any {
  return path.reduce((acc, seg) => (acc == null ? acc : acc[seg]), obj);
}

export function setAt(obj: any, path: PathSeg[], value: any): void {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    const nextSeg = path[i + 1];
    if (cur[seg] == null) cur[seg] = typeof nextSeg === "number" ? [] : {};
    cur = cur[seg];
  }
  cur[path[path.length - 1]] = value;
}
