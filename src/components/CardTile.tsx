import * as React from 'react';
import { Link } from 'react-router-dom';
import './CardTile.css';
import CardStaticInfo from './CardStaticInfo';
import {CardProps} from "../../dist/components/CardTile";

export type CardProps = {
    '@id': string;
    frontText: string;
    backText: string;
    group: string;
    familiarity?: number;
    createdAt?: number;
    hint?: string;
    reviewedCount?: number;
    reviewedAt?: number;
    updatedAt?: number
};

type CardTileProps = {
  card: CardProps;
}

class CardTile extends React.Component<CardTileProps, {}> {
  render() {
    return (
      <Link to={{ pathname: '/edit/' + this.props.card['@id'] }}>
        <div className="card-tile" key={this.props.card['@id']}>
          <div className="card-editable-info">
            <div className="grouping">
              <div className="card-front-text">{this.props.card.frontText}</div>
              <div className="card-back-text">{this.props.card.backText}</div>
            </div>
            <div className="grouping">
              <div className="card-hint card-info">hint: {this.props.card.hint}</div>
              <div className="card-group card-info">group: {this.props.card.group}</div>
            </div>
          </div>
          <CardStaticInfo card={this.props.card} />
        </div>
      </Link>
    );
  }
}

export default CardTile;