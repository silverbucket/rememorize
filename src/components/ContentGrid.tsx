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
    getEntries(id: string): { string: CardProps } | { string: boolean };
    match: {
        params: {
            group: string
        }
    }
};

class ContentGrid extends React.Component<GridProps, {}> {
    render() {
        let identifier: string = "";
        let entries: { string: CardProps } | { string: boolean };
        let keys: Array<string>;

        if (this.props.type == GridType.cards) {
            identifier = this.props.group || this.props.match.params.group || 'default';
        }

        entries = this.props.getEntries(identifier);
        keys = Object.keys(entries);

        return (
            <div className="content-wrapper">
                <Header groupControls={this.props.type == GridType.cards} title={identifier || this.props.type}/>
                <div className="tile-wrapper">
                    {!keys.length ? <div>Nothing here yet...</div> :
                        keys.map(id => {
                            if (this.props.type === GridType.groups) {
                                return (
                                    <GroupTile key={id} name={id} />
                                );
                            } else {
                                return (
                                    <CardTile key={id} card={entries[id]}/>
                                );
                            }

                        })
                    }
                </div>
            </div>
        );
    }
}

export default ContentGrid;
