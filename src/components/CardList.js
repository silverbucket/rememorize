import React, { Component } from 'react';
import PropTypes from 'prop-types';
import CardView, { cardProps } from './CardView';
import './CardList.css';

class CardList extends Component {
  render() {
    return (
      <div>
        <h3>Group: {this.props.groupName}</h3>
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