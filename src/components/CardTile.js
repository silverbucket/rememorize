import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import './CardTile.css';
import CardStaticInfo from './CardStaticInfo';

class CardTile extends Component {
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
          <CardStaticInfo card={this.props.card}></CardStaticInfo>
        </div>
      </Link>
    );
  }
}

export const cardProps = {
  '@id': PropTypes.string.isRequired,
  'frontText': PropTypes.string.isRequired,
  'backText': PropTypes.string.isRequired,
  'familiarity': PropTypes.number.isRequired,
  'createdAt': PropTypes.string.isRequired
};

CardTile.propTypes = {
  card: PropTypes.shape(cardProps)
};

export default CardTile;