import * as React from 'react';
import './CardTile.css';
export declare type CardProps = {
    '@id': string;
    frontText: string;
    backText: string;
    group: string;
    familiarity?: number;
    createdAt?: number;
    hint?: string;
    reviewedCount?: number;
    reviewedAt?: number;
    updatedAt?: number;
};
declare type CardTileProps = {
    card: CardProps;
};
declare class CardTile extends React.Component<CardTileProps, {}> {
    render(): JSX.Element;
}
export default CardTile;
