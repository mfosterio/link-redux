import {
    defaultNS,
    getTermBestLang, normalizeType,
    SomeNode,
} from "link-lib";
import { NamedNode, SomeTerm } from "rdflib";
import { ReactElement, ReactNode } from "react";
import * as React from "react";
import { useDataInvalidation } from "../hooks/useDataInvalidation";

import {
    DataInvalidationProps,
    LabelType,
    LinkContext,
    LinkCtxOverrides,
    LinkedPropType,
    TopologyProp,
} from "../types";

import { LinkedResourceContainer as LRC } from "./LinkedResourceContainer";
import { renderError } from "./Typable";
import { calculateChildProps, useLinkContext } from "./withLinkCtx";

export interface PropertyPropTypes extends DataInvalidationProps, TopologyProp {
    children?: ReactNode;

    /**
     * Pass `true` if the property should render if no data is found.
     * Useful for nesting property's to enable multi-property logic.
     */
    forceRender?: boolean;
    /**
     * The property of the surrounding subject to render.
     * @see LinkedResourceContainer#subject
     */
    label: LabelType;
    /**
     * Controls the amount of resources to be displayed. This must be greater than 0.
     * Pass `Infinity` to render all the items.
     */
    limit?: number;
    /** Internal property used for speeding up some types of renders. */
    linkedProp?: LinkedPropType;
}

export type PropertyWrappedProps = PropertyPropTypes
    & Partial<LinkCtxOverrides>;

const nodeTypes = ["NamedNode", "BlankNode"];

export function getLinkedObjectClass({ label, subject, topology, topologyCtx }: PropertyWrappedProps,
                                     context: LinkContext,
                                     labelOverride?: NamedNode): React.ReactType | undefined {
    return context.lrs.resourcePropertyComponent(
        subject,
        labelOverride || label,
        topology === null ? undefined : topology || topologyCtx,
    );
}

function limitTimes<P extends PropertyWrappedProps>(
    props: P,
    objRaw: SomeTerm[],
    context: LinkContext,
    func: (prop: SomeTerm) => React.ReactNode,
    associationRenderer: React.ReactType,
): React.ReactElement<any> | null {

    const associationProps = associationRenderer !== React.Fragment ? props : null;

    if (objRaw.length === 0) {
        return null;
    } else if (objRaw.length === 1) {
        return React.createElement(associationRenderer, associationProps, func(objRaw[0]));
    } else if (props.limit === 1) {
        return React.createElement(
            associationRenderer,
            associationProps,
            // @ts-ignore
            func(getTermBestLang(objRaw, context.lrs.store.langPrefs)),
        );
    }
    const pLimit = Math.min(...[props.limit, objRaw.length].filter(Number) as number[]);
    const elems = new Array(pLimit);
    for (let i = 0; i < pLimit; i++) {
        elems.push(func(objRaw[i]));
    }

    return React.createElement(associationRenderer, associationProps, elems);
}

function renderChildrenOrValue(props: PropertyWrappedProps, context: LinkContext):
    (p: SomeTerm) => React.ReactNode {

    return function(p: SomeTerm): React.ReactNode {
        if (props.children || p.termType !== "Literal") {
            return React.createElement(React.Fragment, null, props.children || p.value);
        }

        const { topology, topologyCtx, subjectCtx } = props;
        const literalRenderer = context.lrs.getComponentForProperty(
            defaultNS.rdfs("Literal"),
            NamedNode.find(p.datatype.value),
            topology === null ? undefined : topology || topologyCtx,
        );

        if (!literalRenderer) {
            return React.createElement(React.Fragment, null, p.value);
        }

        return React.createElement(
            literalRenderer,
            {
                linkedProp: p,
                subject: p.datatype,
                subjectCtx,
                topology,
                topologyCtx,
            },
        );
    };
}

export function Prop(props: PropertyPropTypes): ReactElement<any> | null {
    const options = { topology: true };

    const [error, setError] = React.useState<Error|undefined>(undefined);
    const context = useLinkContext();
    const subjectData = context.lrs.tryEntity(context.subject);

    const childProps = calculateChildProps(props, context, options);
    try {
    useDataInvalidation(childProps, context);
    } catch (e) {
        setError(e);
    }
    if (subjectData.length === 0) {
        return null;
    }
    const labels = normalizeType(childProps.label);
    const objRaw = subjectData
        .filter((s) => labels.includes(s.predicate))
        .map((s) => s.object);

    if (error) {
        return renderError(childProps, context, error);
    }

    if (objRaw.length === 0 && !childProps.forceRender) {
        return null;
    }

    const associationRenderer = getLinkedObjectClass(
        childProps,
        context,
        defaultNS.rdf("predicate"),
    ) || React.Fragment;
    const associationProps = associationRenderer !== React.Fragment ? childProps : null;
    const component = getLinkedObjectClass(childProps, context);
    if (component) {
        const toRender = limitTimes(
            childProps,
            objRaw,
            context,
            (p) => React.createElement(component, { ...childProps, linkedProp: p }, childProps.children),
            associationRenderer,
        );
        if (toRender === null) {
            return React.createElement(
                associationRenderer,
                associationProps,
                React.createElement(component, { ...childProps }, childProps.children),
            );
        }

        return toRender;
    } else if (objRaw.length > 0) {
        if (nodeTypes.includes(objRaw[0].termType)) {
            const wrapLOC = (p: SomeTerm | undefined) => {
                const lrcProps = {
                    ...childProps,
                    subject: p! as SomeNode,
                };

                return React.createElement(LRC, lrcProps, childProps.children);
            };

            return limitTimes(childProps, objRaw, context, wrapLOC, associationRenderer);
        }

        return limitTimes(
            childProps,
            objRaw,
            context,
            renderChildrenOrValue(childProps, context),
            associationRenderer,
        );
    }
    if (childProps.children) {
        return React.createElement(associationRenderer, associationProps, childProps.children);
    }

    return null;
}

Prop.defaultProps = {
    forceRender: false,
    limit: 1,
    linkedProp: undefined,
};
Prop.displayName = "Property";

export const Property = React.memo(Prop);
