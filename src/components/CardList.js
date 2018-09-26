import React, { Component } from 'react';
import PropTypes from 'prop-types';
import CardTile from './CardTile';
import Header from './Header';
import './CardList.css';

class CardList extends Component {
  render() {
    const cards =  this.props.getCards(this.props.group);
    if (! cards) { return null; }
    return (
      <div>
        <Header groupControls={true} title={this.props.group}/>
        {
          Object.keys(cards).map(id => {
            return (
              <CardTile
                key={id}
                card={cards[id]}
              />
            );
          })
        }
      </div>
    );
  }
}

CardList.propTypes = {
  group: PropTypes.string.isRequired,
  getCards: PropTypes.func.isRequired
};

export default CardList;
