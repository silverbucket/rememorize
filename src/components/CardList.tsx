import * as React from 'react';
import CardTile, {CardProps} from './CardTile';
import Header from './Header';
import './CardList.css';

type CardListProps = {
    group: string,
    getCards(id: string): Array<CardProps>;
};

class CardList extends React.Component<CardListProps, {}> {
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



export default CardList;
