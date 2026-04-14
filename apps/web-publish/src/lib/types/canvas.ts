export type CanvasColor = '1' | '2' | '3' | '4' | '5' | '6' | string;

export interface CanvasNodeBase {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	color?: CanvasColor;
}

export interface CanvasFileNode extends CanvasNodeBase {
	type: 'file';
	file: string;
	subpath?: string;
}

export interface CanvasTextNode extends CanvasNodeBase {
	type: 'text';
	text: string;
}

export interface CanvasLinkNode extends CanvasNodeBase {
	type: 'link';
	url: string;
}

export interface CanvasGroupNode extends CanvasNodeBase {
	type: 'group';
	label?: string;
	backgroundStyle?: 'cover' | 'ratio' | 'repeat';
}

export type CanvasNode = CanvasFileNode | CanvasTextNode | CanvasLinkNode | CanvasGroupNode;

export type CanvasEdgeSide = 'top' | 'right' | 'bottom' | 'left';

export interface CanvasEdge {
	id: string;
	fromNode: string;
	fromSide: CanvasEdgeSide;
	fromEnd?: 'none' | 'arrow';
	toNode: string;
	toSide: CanvasEdgeSide;
	toEnd?: 'none' | 'arrow';
	color?: CanvasColor;
	label?: string;
}

export interface CanvasData {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}
