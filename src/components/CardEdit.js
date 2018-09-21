import React, { Component } from 'react';
import PropTypes from 'prop-types';
import Header from './Header';
import './CardEdit.css';

class CardEdit extends Component {
  render() {
    const card = this.props.getCard(this.props.match.params.id);
    if (! card) { return null; }
    return (
      <div>
        <Header groupControls={false} title="Edit Card" />
        <div className="card-edit" key={card['@id']}>
          <div className="card-editable-info">
            <div className="card-front-text">{card.frontText}</div>
            <div className="card-back-text">{card.backText}</div>
            <div className="card-hint card-info">hint: {card.hint}</div>
            <div className="card-group card-info">group: {card.group}</div>
          </div>
          <div className="card-static-info">
            <div className="card-familiarity">familiarity: {card.familiarity}</div>
            <div className="card-familiarity">times reviewed: {card.reviewedCount}</div>
            <div className="card-reviewed-at">last reviewed: {card.reviewedAt}</div>
            <div className="card-updated-at">updated: {card.updatedAt}</div>
            <div className="card-created-at">created: {card.createdAt}</div>
            <div className="card-id">ID: {card['@id']}</div>
          </div>
        </div>
      </div>
    );
  }
}

CardEdit.propTypes = {
  match: PropTypes.object,
  getCard: PropTypes.func.isRequired
};

export default CardEdit;