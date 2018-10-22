import * as React from 'react';
import { Link } from 'react-router-dom';
import '../Tile.css';
import CardStaticInfo from './CardStaticInfo';

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
    key: string;
}

class CardTile extends React.Component<CardTileProps, {}> {
    render() {
        return (
            <Link to={{ pathname: '/edit/' + this.props.card['@id'] }}>
                <div className="tile" key={this.props.card['@id']}>
                    <div className="tile-editable-info">
                        <div className="grouping">
                            <div className="card-name">{this.props.card.frontText}</div>
                            <div className="card-name">{this.props.card.backText}</div>
                        </div>
                        <div className="grouping">
                            <div className="tile-hint tile-info">hint: {this.props.card.hint}</div>
                            <div className="tile-group tile-info">group: {this.props.card.group}</div>
                        </div>
                    </div>
                    <CardStaticInfo card={this.props.card} />
                </div>
            </Link>
        );
    }
}

export default CardTile;