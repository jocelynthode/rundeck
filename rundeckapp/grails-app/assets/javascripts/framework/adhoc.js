//= require momentutil
//= require knockout.min
//= require knockout-mapping
//= require knockout-foreachprop
//= require historyKO
//= require nodeFiltersKO
//= require adhocCommandKO

/*
 Manifest for "framework/adhoc.gsp" page
 */
/*
 Copyright 2015 SimplifyOps Inc, <http://simplifyops.com>

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */


function showError(message) {
    appendText($("error"), message);
    $("error").show();
}

/**
 * START run execution code
 */

    function disableRunBar(runnning) {
        var runbox = jQuery('#runbox');
        runbox.find('input[type="text"]').prop('disabled', true);
        runbox.find('button.runbutton').prop('disabled', true).addClass('disabled');
        if (runnning) {
            runbox.find('button.runbutton').button('loading');
        }
    }
function enableRunBar() {
    var runbox = jQuery('#runbox');
    runbox.find('input[type="text"]').prop('disabled', false);
    runbox.find('button.runbutton')
        .prop('disabled', false)
        .removeClass('disabled')
        .button('reset');
}
var running = false;
function runStarted() {
    running = true;
}
function afterRun() {
    running = false;
    jQuery('.execRerun').show();
    jQuery('#runFormExec').focus();
}
function runError(msg) {
    jQuery('.errormessage').html(msg);
    jQuery('#runerror').collapse('show');
    jQuery('#runcontent').hide();
    onRunComplete();
}
function requestFailure(trans) {
    runError("Request failed: " + trans.statusText);
}
/**
 * Run the command
 * @param elem
 */
function runFormSubmit(elem) {
    if (running || !$F('runFormExec')) {
        return false;
    }
    if (!nodeFilter.filter() && !nodeFilter.filterName()) {
        //no node filter
        return false;
    }
    var data = jQuery('#' + elem + " :input").serialize();
    adhocCommand.running(true);
    disableRunBar(true);
    runStarted();
    $('runcontent').loading('Starting Execution…');
    jQuery.ajax({
        type: 'POST',
        url: _genUrl(appLinks.scheduledExecutionRunAdhocInline, data),
        beforeSend: _ajaxSendTokens.curry('adhoc_req_tokens'),
        success: function (data, status, xhr) {
            try {
                startRunFollow(data);
            } catch (e) {
                console.log(e);
                runError(e);
            }
        },
        error: function (data, jqxhr, err) {
            requestFailure(jqxhr);
        }
    }).success(_ajaxReceiveTokens.curry('adhoc_req_tokens'));
    return false;
}
/**
 * Load content view to contain output
 * @param data
 */
function startRunFollow(data) {
    if (data.error) {
        runError(data.error);
    } else if (!data.id) {
        runError("Server response was invalid: " + data.toString());
    } else {
        $('runcontent').loading('Loading Output…');
        jQuery('#runcontent').load(_genUrl(appLinks.executionFollowFragment, {
            id: data.id,
            mode: 'tail'
        }), function (resp, status, jqxhr) {
            if (status == 'success') {
                Element.show('runcontent');
                continueRunFollow(data);
            } else {
                requestFailure(jqxhr);
            }
        });
    }
}
/**
 * Start following the output
 * @param data
 */
function continueRunFollow(data) {
    var pageParams = loadJsonData('pageParams');
    var followControl = new FollowControl(data.id, 'runcontent', {
        parentElement: 'commandPerform',
        viewoptionsCompleteId: 'viewoptionscomplete',
        cmdOutputErrorId: 'cmdoutputerror',
        outfileSizeId: 'outfilesize',
        extraParams: pageParams.disableMarkdown,
        smallIconUrl: pageParams.smallIconUrl,
        iconUrl: pageParams.iconUrl,
        lastlines: pageParams.lastlines,
        maxLastLines: pageParams.maxLastLines,
        showFinalLine: {value: false, changed: false},
        colStep: {value: false},
        tailmode: true,
        taildelay: 1,
        truncateToTail: true,
        execData: {node: "test"},
        appLinks: appLinks,
        onComplete: onRunComplete,
        dobind: true
    });
    followControl.beginFollowingOutput(data.id);
}
function onRunComplete() {
    adhocCommand.running(false);
    enableRunBar();
    afterRun();
}

var nodeFilter;
var adhocCommand;

/**
 * Handle embedded content updates
 */
function _updateBoxInfo(name, data) {
    if (data.total && data.total != "0" && !running) {
        enableRunBar();
        adhocCommand.canRun(true);
    } else if (!running) {
        disableRunBar(false);
        adhocCommand.canRun(false);
    }
    if (null != data.total && typeof(nodeFilter) != 'undefined') {
        nodeFilter.total(data.total);
    }
    if (null != data.allcount) {
        if (typeof(nodeFilter) != 'undefined') {
            nodeFilter.allcount(data.allcount);
        }
    }
    if (null != data.filter) {
        if (typeof(nodeFilter) != 'undefined') {
            nodeFilter.filter(data.filter);
        }
    }
}


/**
 * START page init
 */
function init() {
    var pageParams = loadJsonData('pageParams');
    jQuery('body').on('click', '.nodefilterlink', function (evt) {
        evt.preventDefault();
        nodeFilter.selectNodeFilterLink(this);
    });
    jQuery('#nodesContent').on('click', '.closeoutput', function (evt) {
        evt.preventDefault();
        jQuery('#runcontent').hide();
    });
    $$('#runbox input').each(function (elem) {
        if (elem.type == 'text') {
            elem.observe('keypress', function (evt) {
                if (!noenter(evt)) {
                    runFormSubmit('runbox');
                    return false;
                } else {
                    return true;
                }
            });
        }
    });

    //history tabs binding
    var history = new History(appLinks.reportsEventsAjax, appLinks.menuNowrunningAjax);
    ko.applyBindings(history, document.getElementById('activity_section'));
    setupActivityLinks('activity_section', history);
    //if empty query, automatically load first activity_link
    if (pageParams.emptyQuery == 'true') {
        history.activateNowRunningTab();
    }

    //setup node filters knockout bindings
    var filterParams = loadJsonData('filterParamsJSON');
    nodeFilter = new NodeFilters(
        appLinks.frameworkAdhoc,
        appLinks.scheduledExecutionCreate,
        appLinks.frameworkNodes,
        Object.extend(filterParams, {
            elem: pageParams.ukey+'nodeForm',
            view: 'embed',
            maxShown: 20,
            emptyMode: 'blank',
            project: pageParams.project,
            nodesTitleSingular: message('Node'),
            nodesTitlePlural: message('Node.plural')
        }));
    ko.applyBindings(nodeFilter, document.getElementById('actionButtonArea'));
    ko.applyBindings(nodeFilter, document.getElementById('nodefilterViewArea'));
    ko.applyBindings(nodeFilter, document.getElementById('nodefiltersHidden'));

    adhocCommand = new AdhocCommand({commandString:pageParams.runCommand}, nodeFilter);
    ko.applyBindings(adhocCommand, document.getElementById('adhocInput'));

    //show selected named filter
    nodeFilter.filterName.subscribe(function (val) {
        if (val) {
            jQuery('a[data-node-filter-name]').removeClass('active');
            jQuery('a[data-node-filter-name=\'' + val + '\']').addClass('active');
        }
    });
    nodeFilter.updateMatchedNodes();
    jQuery('.act_adhoc_history_dropdown').click(function () {
        adhocCommand.reload();
    });
}
jQuery(document).ready(init);