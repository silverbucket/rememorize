import * as React from 'react';
import './CardEdit.css';
import { CardProps } from './CardTile';
export declare type CardEditProps = {
    saveCard(card: CardProps): void;
    getCard(id: string): CardProps;
    match: {
        params: {
            id: string;
        };
    };
};
declare class CardEdit extends React.Component<CardEditProps, {}> {
    state: {
        redirect: boolean;
    };
    render(): any;
}
export default CardEdit;
