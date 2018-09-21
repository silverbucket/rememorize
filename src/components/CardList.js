import React, { Component } from 'react';
import PropTypes from 'prop-types';
import CardTile from './CardTile';
import Header from './Header';
import './CardList.css';

class CardList extends Component {
  render() {
    const groupList = this.props.getCardList(this.props.group);
    if (! groupList) { return null; }
    return (
      <div>
        <Header groupControls={true} title={this.props.group}/>
        {
          groupList.map(item => {
            return (
              <CardTile
                key={item['@id']}
                card={item}
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
  getCardList: PropTypes.func.isRequired
  //PropTypes.shape(cardProps)).isRequired
};

export default CardList;
