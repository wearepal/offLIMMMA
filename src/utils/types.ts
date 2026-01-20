export type PaintClass = {
  id: number
  name: string
  color: string
}

export enum PaintStyle {
  Polygon = "polygon",
  Freehand = "freehand",
}

export enum ToolMode {
  Cursor = "cursor",
  Paint = "paint",
  Erase = "erase"
}

