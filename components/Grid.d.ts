import * as React from 'react';
import { CardProps } from './cards/CardTile';
import './ContentGrid.css';
export declare enum GridType {
    cards = "cards",
    groups = "groups"
}
declare type GridProps = {
    group?: string;
    type: GridType;
    getCards(id: string): {
        string: CardProps;
    };
    getGroups(): Array<string>;
    match: {
        params: {
            group: string;
        };
    };
};
declare class Grid extends React.Component<GridProps, {}> {
    render(): JSX.Element;
}
export default Grid;
