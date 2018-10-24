import * as React from 'react';
import CardTile, {CardProps} from './cards/CardTile';
import Header from './Header';
import GroupTile from "./GroupTile";
import './ContentGrid.css';


export enum GridType {
    cards = "cards",
    groups = "groups"
}

type GridProps = {
    group?: string;
    type: GridType;
    getCards(id: string): { string: CardProps };
    getGroups(): Array<string>;
    match: {
        params: {
            group: string
        }
    }
};

class ContentGrid extends React.Component<GridProps, {}> {
    render() {
        let identifier: string;
        let cards: { string: CardProps };
        let groups: Array<string>;

        if (this.props.type == GridType.cards) {
            identifier = this.props.group || this.props.match.params.group || 'default';
            cards = this.props.getCards(identifier);
        } else {
            groups = this.props.getGroups();
        }

        if (groups) {
            return (
                <div>
                    <Header groupControls={true} title="groups"/>
                    {
                        groups.map(id => {
                            return (
                                <GroupTile key={id} name={id} />
                            );
                        })
                    }
                </div>
            );
        } else if (cards) {
            return (
                <div className="content-wrapper">
                    <Header groupControls={true} title={identifier || this.props.type}/>
                    <div className="tile-wrapper">
                        {
                            Object.keys(cards).map(id => {
                                return (
                                    <CardTile key={id} card={cards[id]}/>
                                );
                            })
                        }
                    </div>
                </div>
            );
        } else {
            return null;
        }
    }
}

export default ContentGrid;
