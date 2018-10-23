import * as React from 'react';
import { Link } from 'react-router-dom';
import './Tile.css';

export type GroupTileProps = {
    name: string;
};

class GroupTile extends React.Component<GroupTileProps, {}> {
    render() {
        return (
            <Link to={{ pathname: '/group/' + this.props.name }}>
                <div className="tile" key={this.props.name}>
                    <div className="tile-editable-info">
                        <div className="tile-grouping">
                            <div className="tile-name">{this.props.name}</div>
                        </div>
                    </div>
                </div>
            </Link>
        );
    }
}

export default GroupTile;