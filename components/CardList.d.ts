import * as React from 'react';
import { CardProps } from './CardTile';
import './ContentGrid.css';
declare type CardListProps = {
    group: string;
    getCards(id: string): Array<CardProps>;
};
declare class CardList extends React.Component<CardListProps, {}> {
    render(): JSX.Element;
}
export default CardList;
