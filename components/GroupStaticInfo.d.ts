import * as React from 'react';
import { GroupProps } from './GroupTile';
import './GroupStaticInfo.css';
declare type GroupStaticInfoProps = {
    group: GroupProps;
};
declare class GroupStaticInfo extends React.Component<GroupStaticInfoProps, {}> {
    render(): JSX.Element;
}
export default GroupStaticInfo;
