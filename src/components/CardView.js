import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './CardView.css';

class CardView extends Component {
  render() {
    return (
      <div className="card-tile" key={this.props.card['@id']}>
        <div className="card-editable-info">
          <div className="card-front-text">{this.props.card.frontText}</div>
          <div className="card-back-text">{this.props.card.backText}</div>
          <div className="card-hint card-info">hint: {this.props.card.hint}</div>
          <div className="card-group card-info">group: {this.props.card.group}</div>
        </div>
        <div className="card-static-info">
          <div className="card-familiarity">familiarity: {this.props.card.familiarity}</div>
          <div className="card-familiarity">times reviewed: {this.props.card.reviewedCount}</div>
          <div className="card-reviewed-at">last reviewed: {this.props.card.reviewedAt}</div>
          <div className="card-updated-at">updated: {this.props.card.updatedAt}</div>
          <div className="card-created-at">created: {this.props.card.createdAt}</div>
          <div className="card-id">ID: {this.props.card['@id']}</div>
        </div>
      </div>
    )
  }
}

export const cardProps = {
  '@id': PropTypes.string.isRequired,
  'frontText': PropTypes.string.isRequired,
  'backText': PropTypes.string.isRequired,
  'familiarity': PropTypes.number.isRequired,
  'createdAt': PropTypes.string.isRequired
};

CardView.propTypes = {
  card: PropTypes.shape(cardProps)
};;



export default CardView;