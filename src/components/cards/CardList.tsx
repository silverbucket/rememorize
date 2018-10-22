import * as React from 'react';
import CardTile, {CardProps} from './CardTile';
import Header from '../Header';
import './CardList.css';

type CardListProps = {
    group?: string,
    getCards(id: string): Array<CardProps>;
    match: {
        params: {
            group: string
        }
    }
};

class CardList extends React.Component<CardListProps, {}> {
    render() {
        const group = this.props.group || this.props.match.params.group || 'default';
        const cards =  this.props.getCards(group);
        if (! cards) { return null; }
        return (
            <div>
                <Header groupControls={true} title={group}/>
                {
                    Object.keys(cards).map(id => {
                        return (
                            <CardTile key={id} card={cards[id]} />
                        );
                    })
                }
            </div>
        );
    }
}



export default CardList;
