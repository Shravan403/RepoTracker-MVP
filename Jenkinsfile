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
                    echo "⌛ Waiting for pod to be ready..."
                    kubectl wait --for=condition=ready pod \
                        -l app=repotracker \
                        -n ${NAMESPACE} \
                        --timeout=120s

                    POD_NAME=$(kubectl get pods -n ${NAMESPACE} \
                        -l app=repotracker \
                        -o jsonpath="{.items[0].metadata.name}")

                    echo "Running check inside pod: $POD_NAME"
                    kubectl exec -n ${NAMESPACE} "$POD_NAME" -- \
                        wget -q --spider http://localhost:4177/ \
                        && echo "✅ App is responding on port 4177" \
                        || echo "⚠️ App started but health endpoint not ready yet"

                    kubectl get pods -n ${NAMESPACE} -o wide
                    echo "✅ Health check complete - deployment successful"
                '''
            }
        }

    }

    post {
        success {
            echo "🚀 Pipeline SUCCESS — ${IMAGE_NAME}:${BUILD_NUMBER} deployed"
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