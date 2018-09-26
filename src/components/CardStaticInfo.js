import React, { Component } from 'react';
import PropTypes from 'prop-types';
import cardProps from './CardTile';
import './CardStaticInfo.css';

class CardStaticInfo extends Component {
  render() {
    return (
      <div className="card-static-info">
        <div className="card-familiarity">
          <span>familiarity:</span> {this.props.card.familiarity}
        </div>
        <div className="card-familiarity">
          <span>times reviewed:</span> {this.props.card.reviewedCount}
        </div>
        <div className="card-reviewed-at">
          <span>last reviewed:</span> {this.props.card.reviewedAt}
        </div>
        <div className="card-updated-at">
          <span>updated:</span> {this.props.card.updatedAt}
        </div>
        <div className="card-created-at">
          <span>created:</span> {this.props.card.createdAt}
        </div>
        <div className="card-id">
          <span>id</span>: {this.props.card['@id']}
        </div>
      </div>
    );
  }
}

CardStaticInfo.propTypes = {
  card: PropTypes.shape(cardProps)
};
export default CardStaticInfo;