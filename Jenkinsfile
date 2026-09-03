pipeline {
    agent any

    environment {
        IMAGE_NAME = "ghcr.io/shravan403/repotracker-mvp"
        NAMESPACE  = "repotracker"
        KUBECONFIG = "/var/jenkins_home/.kube/config"
    }

    stages {

        stage('Checkout') {
            steps {
                git branch: 'main',
                    url: 'https://github.com/Shravan403/RepoTracker-MVP'
                echo "✅ Code checked out — commit: ${env.GIT_COMMIT}"
            }
        }

        stage('Build Docker Image') {
            steps {
                sh '''
                    docker build -t ${IMAGE_NAME}:${BUILD_NUMBER} \
                                 -t ${IMAGE_NAME}:latest .
                    echo "✅ Image built: ${IMAGE_NAME}:${BUILD_NUMBER}"
                '''
            }
        }

        stage('Push to GitHub Container Registry') {
            steps {
                withCredentials([string(credentialsId: 'ghcr-token',
                                        variable: 'GHCR_TOKEN')]) {
                    sh '''
                        echo ${GHCR_TOKEN} | docker login ghcr.io \
                            -u shravan403 --password-stdin
                        docker push ${IMAGE_NAME}:${BUILD_NUMBER}
                        docker push ${IMAGE_NAME}:latest
                        echo "✅ Image pushed to GHCR"
                    '''
                }
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                sh '''
                    kubectl set image deployment/repotracker \
                        repotracker=${IMAGE_NAME}:${BUILD_NUMBER} \
                        -n ${NAMESPACE}
                    kubectl rollout status deployment/repotracker \
                        -n ${NAMESPACE} --timeout=120s
                    echo "✅ Deployment successful"
                '''
            }
        }

stage('Health Check') {
            steps {
                sh '''
                    kubectl get pods -n ${NAMESPACE}
                    
                    # Get the assigned NodePort
                    NODE_PORT=$(kubectl get svc repotracker-service \
                        -n ${NAMESPACE} \
                        -o jsonpath="{.spec.ports[0].nodePort}")
                        
                    # Get the internal IP of the Minikube cluster node
                    MINIKUBE_IP=$(kubectl get nodes \
                        -o jsonpath="{.items[0].status.addresses[?(@.type=='InternalIP')].address}")
                        
                    # Ping the live application
                    curl -f http://${MINIKUBE_IP}:${NODE_PORT}/ \
                        && echo "✅ Health check passed" \
                        || (echo "❌ Health check failed" && exit 1)
                '''
            }
        }

    }

    post {
        success {
            echo "Pipeline SUCCESS — ${IMAGE_NAME}:${BUILD_NUMBER} deployed"
        }
        failure {
            echo "❌ Pipeline FAILED — rolling back"
            sh '''
                kubectl rollout undo deployment/repotracker \
                    -n ${NAMESPACE} || true
            '''
        }
        always {
            sh 'docker system prune -f || true'
        }
    }
}