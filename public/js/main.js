angular.module('castDog',['ngMaterial'])
    .config(function($mdThemingProvider) {
        $mdThemingProvider.theme('default')
            .primaryPalette('cyan')
            .accentPalette('orange')
            .backgroundPalette('grey')
            .dark();
    }).controller('hostDialogController', [
        '$scope', '$mdDialog',
        function($scope,$mdDialog) {
            $scope.hide = function() {
                $mdDialog.hide();
            };
            $scope.cancel = function() {
                $mdDialog.cancel();
            };
            $scope.answer = function(answer) {
                $mdDialog.hide(answer);
            };
            $scope.rotateLeft = function(config) {
                config.rotation += 270;
                config.rotation %= 360;
            };
            $scope.rotateRight = function(config) {
                config.rotation += 90;
                config.rotation %= 360;
            };
            $scope.zoomIn = function(config) {
                config.zoom += 0.1;
            };
            $scope.zoomOut = function(config) {
                config.zoom -= 0.1;
            };
            $scope.zoomReset = function(config) {
                config.zoom = 1;
            };
            $scope.aspect = function(config,aspect) {
                config.aspect = aspect;
            };
        }
    ]).directive('castFrame',function($timeout) {
        return {
            restrict: 'A',
            scope: {
                config: '=castFrame'
            },
            link: function($scope,$element,$attrs) {
                $timeout(function() {
                    var container = $element.parent();
                    var w = container.width();
                    var a = ($scope.config.aspect=='native')?16/9:$scope.config.aspect;
                    var r = $scope.config.rotation % 180;
                    // if (r) {
                    //     a = 1/a;
                    // }
                    var h = w/a;
                    var z = $scope.config.zoom;
                    // console.log(container,w,h,a);
                    container.height(h);
                    $element.width(w/z);
                    $element.height(h/z);
                    $element.css({
                        transform: 'scale('+z+')',
                        transformOrigin: '0 0'
                    });
                    $element[0].src = $scope.config.url;
                });
            }
        }
    }).controller('hostsController',[
        '$scope','$http','$mdDialog',
        function($scope,$http,$mdDialog) {
            $http.get('hosts').success(function(result) {
                $scope.hosts = result;
                $scope.hosts.forEach(function(host) {
                    if (host.pup) {
                        host.$frameConfig = {
                            zoom: 0.4,
                            url: host.pup.url,
                            aspect: host.pup.aspect,
                            rotation: host.pup.rotation
                        };
                    }
                });
            });

            var initConfig = function(host) {
                host.config = host.config||{};
                var c = host.config;
                c.zoom = c.zoom||1;
                c.rotation = c.rotation||0;
            };

            $scope.editHostDlg = function(host) {
                $scope.host = host;
                initConfig($scope.host);
                return $mdDialog.show({
                    parent: angular.element(document.body),
                    templateUrl: 'editHostDialogTemplate',
                    controller: 'hostDialogController',
                    scope: $scope.$new()
                }).then(function(result) {
                    if (result) {
                        console.log(result);
                        $http.post('hosts/'+result.name+'/config',result.config).success(function() {
                            console.log('config saved');
                        });
                    }
                });
            }
            $scope.closeHostDlg = function() {
                delete $scope.host;
            }
        }
    ]);