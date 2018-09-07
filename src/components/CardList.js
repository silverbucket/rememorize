import React, { Component } from 'react';
import iconAdd from '../res/icon_add.svg';
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
              <h3>{this.props.groupName}</h3>
            </div>
            <div className="group-controls">
              <a className="button" href=""><img src={iconAdd} className="icon icon-add" alt="add" /></a>
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