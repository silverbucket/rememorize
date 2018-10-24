import * as React from 'react';
import { CardProps } from './CardTile';
import './CardList.css';
declare type CardListProps = {
    group?: string;
    getCards(id: string): Array<CardProps>;
    match: {
        params: {
            group: string;
        };
    };
};
declare class Grid extends React.Component<CardListProps, {}> {
    render(): JSX.Element;
}
export default Grid;
