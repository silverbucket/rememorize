import * as React from 'react';
import { CardProps } from './CardTile';
import './CardStaticInfo.css';
declare type CardStaticInfoProps = {
    card: CardProps;
};
declare class CardStaticInfo extends React.Component<CardStaticInfoProps, {}> {
    render(): JSX.Element;
}
export default CardStaticInfo;
