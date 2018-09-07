import React, { Component } from 'react';
import iconPlus from '../res/icon_plus.svg';
import PropTypes from 'prop-types';
import CardView, { cardProps } from './CardView';
import './CardList.css';

class CardList extends Component {
  render() {
    return (
      <div>
        <div className="group-header">
          <div className="group-row">
            <div className="group-title">
              <h3>Group: {this.props.groupName}</h3>
            </div>
            <div className="group-controls">
              <a className="button" href=""><img src={iconPlus} className="icon icon-plus" /></a>
            </div>
          </div>
        </div>
        {
          this.props.cardList.map(item => {
            return (
              <CardView
                key={item['@id']}
                card={item}
              />
            )
          })
        }
      </div>
    )
  }
}

CardList.propTypes = {
  groupName: PropTypes.string.isRequired,
  cardList: PropTypes.arrayOf(PropTypes.shape(cardProps)).isRequired
};

export default CardList;